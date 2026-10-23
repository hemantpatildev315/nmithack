import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { calculateAcuity, calculateVitalRiskIndex, matchResourceAllocation } from "@/lib/tools/triage";
import { VitalsSchema, Vitals, Patient } from "@/lib/types";
import { mockTriageStore } from "@/lib/db/mockStore";
import { POST, GET } from "@/app/api/agent/route";
import { NextRequest } from "next/server";
import { ZodError } from "zod";

describe("Healthcare Triage Deterministic Tooling", () => {
  it("should calculate exact vital risk indices and identify physiological risk factors", () => {
    const vitals: Vitals = {
      heartRate: 145,
      systolicBp: 75,
      diastolicBp: 45,
      spO2: 82,
      respiratoryRate: 36,
    };
    const { score, riskFactors } = calculateVitalRiskIndex(vitals);
    expect(score).toBeGreaterThanOrEqual(8.0);
    expect(riskFactors.length).toBe(4);
  });
  it("should accurately score critical vital signs as ESI Level 1 (Immediate)", () => {
    const criticalVitals: Vitals = {
      heartRate: 185, // Extreme tachycardia
      systolicBp: 65, // Shock
      diastolicBp: 40,
      spO2: 78, // Severe hypoxemia
      respiratoryRate: 44, // Severe tachypnea
      glasgowComaScale: 6, // Unresponsive
    };

    const acuity = calculateAcuity(criticalVitals);

    expect(acuity.esiLevel).toBe(1);
    expect(acuity.esiCategory).toBe("IMMEDIATE");
    expect(acuity.isCritical).toBe(true);
    expect(acuity.vitalRiskScore).toBeGreaterThanOrEqual(7.5);
    expect(acuity.riskFactors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Critical Hypoxemia"),
        expect.stringContaining("Extreme Heart Rate"),
        expect.stringContaining("Hypotensive Shock"),
      ])
    );
  });

  it("should accurately score high-risk vitals as ESI Level 2 (Emergent)", () => {
    const emergentVitals: Vitals = {
      heartRate: 125,
      systolicBp: 88,
      diastolicBp: 55,
      spO2: 89,
      respiratoryRate: 29,
    };

    const acuity = calculateAcuity(emergentVitals);

    expect(acuity.esiLevel).toBe(2);
    expect(acuity.esiCategory).toBe("EMERGENT");
    expect(acuity.isCritical).toBe(true);
    expect(acuity.clinicalFlag).toBe("HIGH_RISK_EMERGENT");
  });

  it("should accurately score completely normal vitals as ESI Level 5 (Non-urgent)", () => {
    const normalVitals: Vitals = {
      heartRate: 72,
      systolicBp: 118,
      diastolicBp: 76,
      spO2: 99,
      respiratoryRate: 16,
      temperatureCelsius: 36.8,
      glasgowComaScale: 15,
    };

    const acuity = calculateAcuity(normalVitals);

    expect(acuity.esiLevel).toBe(5);
    expect(acuity.esiCategory).toBe("NON_URGENT");
    expect(acuity.isCritical).toBe(false);
    expect(acuity.vitalRiskScore).toBe(0);
    expect(acuity.riskFactors.length).toBe(0);
  });

  it("should match ESI 1 to ICU or ER with resuscitation equipment", async () => {
    const capacities = await mockTriageStore.getDepartmentCapacities();
    const acuity = calculateAcuity({
      heartRate: 190,
      systolicBp: 60,
      diastolicBp: 40,
      spO2: 75,
      respiratoryRate: 42,
    });

    const allocation = matchResourceAllocation(acuity, capacities);

    expect(["ICU", "ER"]).toContain(allocation.recommendedDepartment);
    expect(allocation.priorityQueueRank).toBe(1);
    expect(allocation.estimatedWaitMinutes).toBe(0);
    expect(allocation.equipmentNeeded).toEqual(
      expect.arrayContaining([expect.stringContaining("Ventilator"), expect.stringContaining("Cardiac Monitor")])
    );
  });
});

describe("Strict Zod Vitals & Input Validation", () => {
  it("should reject negative or out-of-range vitals with descriptive Zod errors", () => {
    const negativeVitals = {
      heartRate: -45, // Invalid negative
      systolicBp: -100, // Invalid negative
      diastolicBp: 50,
      spO2: 150, // Exceeds 100%
      respiratoryRate: -5, // Invalid negative
    };

    expect(() => VitalsSchema.parse(negativeVitals)).toThrow(ZodError);

    try {
      VitalsSchema.parse(negativeVitals);
    } catch (err) {
      const zodErr = err as ZodError;
      const issues = zodErr.issues.map((i) => i.path.join("."));
      expect(issues).toContain("heartRate");
      expect(issues).toContain("systolicBp");
      expect(issues).toContain("spO2");
      expect(issues).toContain("respiratoryRate");
    }
  });

  it("should reject malformed vitals below minimum physiological thresholds", () => {
    expect(() =>
      calculateAcuity({
        heartRate: 10, // Below min 20
        systolicBp: 20, // Below min 40
        diastolicBp: 10,
        spO2: 80,
        respiratoryRate: 2, // Below min 4
      })
    ).toThrow(ZodError);
  });
});

describe("In-Memory Department Capacity Store & Simulated Pagination", () => {
  beforeEach(async () => {
    await mockTriageStore.resetStore();
  });

  it("should track department capacities and allocate beds dynamically", async () => {
    const initialIcu = await mockTriageStore.getDepartmentCapacity("ICU");
    expect(initialIcu).not.toBeNull();
    const initialAvailable = initialIcu!.availableBeds;

    const allocation = await mockTriageStore.allocateBed("ICU");
    expect(allocation.success).toBe(true);
    expect(allocation.bedId).toMatch(/^ICU-BED-/);

    const updatedIcu = await mockTriageStore.getDepartmentCapacity("ICU");
    expect(updatedIcu!.availableBeds).toBe(initialAvailable - 1);
  });

  it("should implement simulated pagination (limit, offset) efficiently", async () => {
    // Seed multiple assessments
    const testPatient: Patient = {
      id: "pt-paginated",
      name: "Test Patient",
      age: 45,
      gender: "male",
      chiefComplaint: "Mild headache",
      medicalHistory: [],
      allergies: [],
    };

    const vitals: Vitals = {
      heartRate: 75,
      systolicBp: 120,
      diastolicBp: 80,
      spO2: 98,
      respiratoryRate: 16,
    };

    const acuity = calculateAcuity(vitals);
    const capacities = await mockTriageStore.getDepartmentCapacities();
    const allocation = matchResourceAllocation(acuity, capacities);

    await mockTriageStore.saveTriageAssessment({
      patient: testPatient,
      vitals,
      deterministicScore: acuity,
      aiReasoning: "Observation recommended",
      clinicalSummary: "Stable ambulatory patient",
      finalEsiLevel: 5,
      resourceAllocation: allocation,
      isFallback: true,
      executionDurationMs: 15,
    });

    const page1 = await mockTriageStore.listTriageAssessments({ limit: 1, offset: 0 });
    expect(page1.items.length).toBe(1);
    expect(page1.limit).toBe(1);
    expect(page1.offset).toBe(0);
    expect(page1.total).toBeGreaterThanOrEqual(2);
    expect(page1.hasMore).toBe(true);

    const page2 = await mockTriageStore.listTriageAssessments({ limit: 1, offset: 1 });
    expect(page2.items.length).toBe(1);
    expect(page2.offset).toBe(1);
  });
});

describe("Structured AI Reasoning Route (POST /api/agent)", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(async () => {
    await mockTriageStore.resetStore();
    delete process.env.GEMINI_API_KEY; // Ensure offline fallback testing
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.GEMINI_API_KEY = originalKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("should fall back gracefully when GEMINI_API_KEY is absent and complete within 1 second", async () => {
    const startTime = performance.now();

    const requestPayload = {
      patient: {
        id: "pt_agent_test",
        name: "Marcus Vance",
        age: 58,
        gender: "male",
        chiefComplaint: "Severe crushing retrosternal chest pain radiating to left arm",
        medicalHistory: ["Coronary Artery Disease", "Hypertension"],
        allergies: ["Aspirin"],
      },
      vitals: {
        heartRate: 132,
        systolicBp: 84,
        diastolicBp: 52,
        spO2: 90,
        respiratoryRate: 28,
        glasgowComaScale: 14,
      },
      notes: "Diaphoretic, pale, active chest pain for 45 minutes",
    };

    const req = new NextRequest("http://localhost:3000/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });

    const response = await POST(req);
    const duration = performance.now() - startTime;

    // Latency SLA: must execute within 1 second
    expect(duration).toBeLessThan(1000);
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.isFallback).toBe(true);
    expect(body.data.finalEsiLevel).toBe(2); // Emergent
    expect(body.data.deterministicScore.isCritical).toBe(true);
    expect(body.data.resourceAllocation.recommendedDepartment).toBe("ER");
    expect(body.data.resourceAllocation.allocatedBedId).toBeDefined();
    expect(body.data.clinicalSummary).toContain("Marcus Vance");
    expect(body.data.aiReasoning).toBeTypeOf("string");

    // Verify record was persisted into in-memory mock store
    const stored = await mockTriageStore.getTriageAssessmentById(body.data.id);
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(body.data.id);
  });

  it("should return 422 Unprocessable Entity when request payload contains invalid vitals", async () => {
    const invalidPayload = {
      patient: {
        id: "pt_invalid",
        name: "Invalid Patient",
        age: 30,
        gender: "other",
        chiefComplaint: "Checkup",
      },
      vitals: {
        heartRate: -100, // Invalid
        systolicBp: 120,
        diastolicBp: 80,
        spO2: 120, // Invalid > 100
        respiratoryRate: 16,
      },
    };

    const req = new NextRequest("http://localhost:3000/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload),
    });

    const response = await POST(req);
    expect(response.status).toBe(422);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("should query past triage assessments via GET /api/agent with pagination", async () => {
    const req = new NextRequest("http://localhost:3000/api/agent?limit=5&offset=0");
    const response = await GET(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
  });
});
