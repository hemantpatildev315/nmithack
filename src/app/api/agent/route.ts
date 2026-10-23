import { NextRequest } from "next/server";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import {
  TriageRequestSchema,
  TriageQuerySchema,
  DepartmentType,
  ResourceAllocation,
} from "@/lib/types";
import { calculateAcuity, matchResourceAllocation } from "@/lib/tools/triage";
import { mockTriageStore } from "@/lib/db/mockStore";
import { parseJsonSafely } from "@/lib/tools/data-parser";

/**
 * GET /api/agent
 * Query past triage assessments with simulated pagination (limit, offset)
 * or retrieve live hospital department capacities (?capacities=true).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.get("capacities") === "true") {
      const capacities = await mockTriageStore.getDepartmentCapacities();
      return apiSuccess(capacities);
    }

    const query = TriageQuerySchema.parse({
      limit: searchParams.get("limit") ?? 10,
      offset: searchParams.get("offset") ?? 0,
      esiLevel: searchParams.get("esiLevel") ?? undefined,
      department: searchParams.get("department") ?? undefined,
    });

    const paginated = await mockTriageStore.listTriageAssessments(query);
    return apiSuccess(paginated);
  } catch (error) {
    return handleApiError(error, "Failed to retrieve triage assessments");
  }
}

/**
 * POST /api/agent
 * Autonomous Healthcare Triage & Emergency Resource Allocation Agent.
 * Executes:
 *   1. Strict Zod validation on patient and vital signs.
 *   2. Pure deterministic ESI acuity scoring & vital risk calculations.
 *   3. Real-time department capacity querying.
 *   4. Google Gemini synthesis using @google/genai with structured JSON output.
 *   5. Automatic fallback resilience (sub-second execution guarantee, never crashes).
 *   6. Persistence in mockStore.
 */
export async function POST(req: NextRequest) {
  const startTime = performance.now();

  try {
    const rawBody = await req.json();

    // 1. Validate inbound payload with Zod
    const validatedRequest = TriageRequestSchema.parse(rawBody);
    const { patient, vitals, forceFallback, notes } = validatedRequest;

    // 2. Deterministic Triage Acuity Calculation
    const acuity = calculateAcuity(vitals);

    // 3. Query in-memory department capacities
    const capacities = await mockTriageStore.getDepartmentCapacities();
    const baselineAllocation = matchResourceAllocation(acuity, capacities);

    // 4. Gemini Reasoning Synthesis or Safe Fallback
    const apiKey = process.env.GEMINI_API_KEY;
    const shouldFallback = forceFallback || !apiKey;

    let aiReasoning: string;
    let clinicalSummary: string;
    let resourceAllocation: ResourceAllocation = baselineAllocation;
    let isFallback = false;

    if (!shouldFallback) {
      try {
        // Enforce 800ms timeout budget for sub-second total execution
        const aiPromise = (async () => {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey });

          const prompt = `You are a Board-Certified Emergency Physician Triage AI.
Analyze the following patient and deterministic triage telemetry:

PATIENT:
- Name: ${patient.name}, Age: ${patient.age}, Gender: ${patient.gender}
- Chief Complaint: "${patient.chiefComplaint}"
- Medical History: ${patient.medicalHistory.join(", ") || "None"}
- Allergies: ${patient.allergies.join(", ") || "NKDA"}
${notes ? `- Additional Triage Notes: "${notes}"` : ""}

VITAL SIGNS:
- HR: ${vitals.heartRate} bpm, BP: ${vitals.systolicBp}/${vitals.diastolicBp} mmHg, SpO2: ${vitals.spO2}%, RR: ${vitals.respiratoryRate} bpm
${vitals.temperatureCelsius ? `- Temp: ${vitals.temperatureCelsius}°C` : ""}
${vitals.glasgowComaScale ? `- GCS: ${vitals.glasgowComaScale}/15` : ""}

DETERMINISTIC ACUITY ANALYSIS:
- ESI Level: ${acuity.esiLevel} (${acuity.esiCategory})
- Vital Risk Score: ${acuity.vitalRiskScore}/10
- Risk Factors: ${acuity.riskFactors.join("; ") || "None"}
- Clinical Flag: ${acuity.clinicalFlag}

HOSPITAL DEPARTMENT CAPACITIES:
${capacities.map((c) => `- ${c.department}: ${c.availableBeds}/${c.totalBeds} beds available (${(c.utilizationRate * 100).toFixed(0)}% full)`).join("\n")}

Respond ONLY with valid JSON conforming exactly to this structure:
{
  "clinicalSummary": "Concise 1-2 sentence emergency physician summary",
  "aiReasoning": "Detailed clinical rationale explaining physiological risks and placement urgency",
  "recommendedDepartment": "ICU" | "ER" | "General Ward" | "Fast Track",
  "priorityQueueRank": 1 | 2 | 3 | 4 | 5,
  "equipmentNeeded": ["Equipment 1", "Equipment 2"]
}`;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          });

          return response.text ?? "";
        })();

        // Timeout race: 800ms max
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini API call exceeded 800ms SLA")), 800)
        );

        const rawJsonText = await Promise.race([aiPromise, timeoutPromise]);
        const parsed = parseJsonSafely<{
          clinicalSummary: string;
          aiReasoning: string;
          recommendedDepartment: DepartmentType;
          priorityQueueRank: number;
          equipmentNeeded: string[];
        }>(rawJsonText);

        if (parsed.success && parsed.data) {
          clinicalSummary = parsed.data.clinicalSummary;
          aiReasoning = parsed.data.aiReasoning;

          const validDepts: DepartmentType[] = ["ICU", "ER", "General Ward", "Fast Track"];
          const dept = validDepts.includes(parsed.data.recommendedDepartment)
            ? parsed.data.recommendedDepartment
            : baselineAllocation.recommendedDepartment;

          resourceAllocation = {
            ...baselineAllocation,
            recommendedDepartment: dept,
            priorityQueueRank: parsed.data.priorityQueueRank ?? baselineAllocation.priorityQueueRank,
            equipmentNeeded:
              parsed.data.equipmentNeeded?.length > 0
                ? parsed.data.equipmentNeeded
                : baselineAllocation.equipmentNeeded,
          };
        } else {
          throw new Error("Invalid structured JSON returned from Gemini");
        }
      } catch (aiError) {
        console.warn(
          "[Healthcare Agent] Falling back to deterministic clinical protocol:",
          aiError instanceof Error ? aiError.message : aiError
        );
        isFallback = true;
        const fallbackSynthesis = buildDeterministicSynthesis(patient, vitals, acuity, baselineAllocation);
        clinicalSummary = fallbackSynthesis.clinicalSummary;
        aiReasoning = fallbackSynthesis.aiReasoning;
      }
    } else {
      isFallback = true;
      const fallbackSynthesis = buildDeterministicSynthesis(patient, vitals, acuity, baselineAllocation);
      clinicalSummary = fallbackSynthesis.clinicalSummary;
      aiReasoning = fallbackSynthesis.aiReasoning;
    }

    // 5. Reserve Bed in Department if Available
    const bedAllocation = await mockTriageStore.allocateBed(resourceAllocation.recommendedDepartment);
    if (bedAllocation.success && bedAllocation.bedId) {
      resourceAllocation.allocatedBedId = bedAllocation.bedId;
    }

    const executionDurationMs = Math.round(performance.now() - startTime);

    // 6. Persist Triage Assessment in In-Memory Store
    const savedAssessment = await mockTriageStore.saveTriageAssessment({
      patient,
      vitals,
      deterministicScore: acuity,
      aiReasoning,
      clinicalSummary,
      finalEsiLevel: acuity.esiLevel,
      resourceAllocation,
      isFallback,
      executionDurationMs,
    });

    return apiSuccess(savedAssessment, 201);
  } catch (error) {
    return handleApiError(error, "Failed to process emergency triage assessment");
  }
}

/**
 * Deterministic clinical fallback synthesis ensuring 100% test reliability and sub-second performance.
 */
function buildDeterministicSynthesis(
  patient: { name: string; age: number; chiefComplaint: string },
  vitals: { heartRate: number; systolicBp: number; spO2: number; respiratoryRate: number },
  acuity: { esiLevel: number; esiCategory: string; vitalRiskScore: number; riskFactors: string[]; clinicalFlag: string },
  allocation: ResourceAllocation
): { clinicalSummary: string; aiReasoning: string } {
  const riskCount = acuity.riskFactors.length;
  const riskList = riskCount > 0 ? acuity.riskFactors.join(", ") : "no acute vital deviations";

  const clinicalSummary = `[Deterministic Protocol] ${patient.name} (${patient.age}y) triaged at ESI Level ${acuity.esiLevel} (${acuity.esiCategory}). Target: ${allocation.recommendedDepartment} (Priority ${allocation.priorityQueueRank}).`;

  const aiReasoning = `Clinical assessment based on deterministic early warning score (${acuity.vitalRiskScore}/10). Presenting with "${patient.chiefComplaint}". Vital signs indicate ${riskList} (HR: ${vitals.heartRate}, BP: ${vitals.systolicBp}, SpO2: ${vitals.spO2}%, RR: ${vitals.respiratoryRate}). Immediate allocation to ${allocation.recommendedDepartment} recommended with ${allocation.equipmentNeeded.slice(0, 2).join(" and ")}.`;

  return { clinicalSummary, aiReasoning };
}
