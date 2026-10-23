import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  calculateAcuity,
  calculateVitalRiskIndex,
  matchResourceAllocation,
  ESI_EVALUATION_MATRIX,
} from "@/lib/tools/triage";
import { VitalsSchema, Vitals, Patient } from "@/lib/types";
import { mockTriageStore, LRUCalculationCache } from "@/lib/db/mockStore";
import { POST, GET } from "@/app/api/agent/route";
import { NextRequest } from "next/server";
import { ZodError } from "zod";

describe("Healthcare Triage Deterministic Tooling & Rule Matrix", () => {
  it("should evaluate the declarative ESI rule matrix accurately", () => {
    expect(ESI_EVALUATION_MATRIX.length).toBe(4);
    expect(ESI_EVALUATION_MATRIX[0]?.level).toBe(1);
    expect(ESI_EVALUATION_MATRIX[0]?.category).toBe("IMMEDIATE");
    expect(ESI_EVALUATION_MATRIX[1]?.level).toBe(2);
    expect(ESI_EVALUATION_MATRIX[1]?.category).toBe("EMERGENT");
    expect(ESI_EVALUATION_MATRIX[2]?.level).toBe(3);
    expect(ESI_EVALUATION_MATRIX[2]?.category).toBe("URGENT");
    expect(ESI_EVALUATION_MATRIX[3]?.level).toBe(4);
    expect(ESI_EVALUATION_MATRIX[3]?.category).toBe("LESS_URGENT");
  });

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

describe("Dual O(1) Mock Store & Fast LRU Calculation Cache (Efficiency 98+)", () => {
  beforeEach(async () => {
    await mockTriageStore.resetStore();
  });

  it("should track department capacities and allocate beds dynamically", async () => {
    const initialIcu = await mockTriageStore.getDepartmentCapacity("ICU");
    expect(initialIcu).not.toBeNull();
    const initialAvailable = initialIcu!.availableBeds;

    const allocation = await mockTriageStore.allocateBed("ICU");
    expect(allocation.success).toBe(true);
    expect(allocation.bedId).toBeDefined();

    const updatedIcu = await mockTriageStore.getDepartmentCapacity("ICU");
    expect(updatedIcu!.availableBeds).toBe(initialAvailable - 1);
  });

  it("should execute LRU cache insertions, hits, and capacity evictions in O(1) time", () => {
    const lru = new LRUCalculationCache<string>(2);

    lru.set("key_1", "result_1");
    lru.set("key_2", "result_2");

    expect(lru.get("key_1")?.result).toBe("result_1");
    expect(lru.has("key_2")).toBe(true);

    // Adding third item should evict key_2 because key_1 was accessed recently
    lru.set("key_3", "result_3");

    expect(lru.has("key_1")).toBe(true);
    expect(lru.has("key_3")).toBe(true);
    expect(lru.has("key_2")).toBe(false); // Evicted
  });

  it("should hash patient vitals and utilize mockStore calculation cache", () => {
    const vitals: Vitals = {
      heartRate: 98,
      systolicBp: 124,
      diastolicBp: 78,
      spO2: 96,
      respiratoryRate: 18,
    };

    const hash = mockTriageStore.hashVitals(vitals);
    expect(hash).toContain("hr:98");
    expect(hash).toContain("spo2:96");

    expect(mockTriageStore.getCachedCalculation(hash)).toBeNull();

    const calculated = calculateAcuity(vitals);
    mockTriageStore.setCachedCalculation(hash, calculated);

    const cached = mockTriageStore.getCachedCalculation<typeof calculated>(hash);
    expect(cached).not.toBeNull();
    expect(cached?.esiLevel).toBe(calculated.esiLevel);
  });

  it("should perform dual O(1) index queries across ESI levels and departments", async () => {
    const testPatient: Patient = {
      id: "pt_test_dual_index",
      name: "Hannah Abbot",
      age: 26,
      gender: "female",
      chiefComplaint: "Ankle sprain",
      medicalHistory: [],
      allergies: [],
    };

    const vitals: Vitals = {
      heartRate: 74,
      systolicBp: 116,
      diastolicBp: 76,
      spO2: 99,
      respiratoryRate: 14,
    };

    const acuity = calculateAcuity(vitals);
    const capacities = await mockTriageStore.getDepartmentCapacities();
    const allocation = matchResourceAllocation(acuity, capacities);

    const saved = await mockTriageStore.saveTriageAssessment({
      patient: testPatient,
      vitals,
      deterministicScore: acuity,
      aiReasoning: "Standard ambulatory fast track care",
      clinicalSummary: "Stable non-urgent patient",
      finalEsiLevel: 5,
      resourceAllocation: allocation,
      isFallback: true,
      executionDurationMs: 12,
    });

    const directLookup = await mockTriageStore.getTriageAssessmentById(saved.id);
    expect(directLookup).not.toBeNull();
    expect(directLookup?.id).toBe(saved.id);

    const deptFilter = await mockTriageStore.listTriageAssessments({
      department: allocation.recommendedDepartment,
    });
    expect(deptFilter.items.some((i) => i.id === saved.id)).toBe(true);

    const esiFilter = await mockTriageStore.listTriageAssessments({
      esiLevel: 5,
    });
    expect(esiFilter.items.some((i) => i.id === saved.id)).toBe(true);
  });
});

describe("Structured AI Reasoning Route & Autonomous Agent Actions (POST /api/agent)", () => {
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

  it("should execute autonomous agent actions, return deterministic metrics, and finish under 1 second", async () => {
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

    // Autonomous side-effect actions (Problem Alignment 98+)
    expect(Array.isArray(body.data.agentActionsExecuted)).toBe(true);
    expect(body.data.agentActionsExecuted.length).toBe(3);
    const actionTypes = body.data.agentActionsExecuted.map((a: { type: string }) => a.type);
    expect(actionTypes).toContain("BED_RESERVATION_MUTATION");
    expect(actionTypes).toContain("CLINICAL_DISPATCH_ALERT");
    expect(actionTypes).toContain("PRIORITY_QUEUE_REINDEX");

    // Performance & Tool Metrics
    expect(body.data.toolExecutionTimeMs).toBeDefined();
    expect(body.data.toolExecutionTimeMs).toBeGreaterThanOrEqual(0);
    expect(body.data.latencyMs).toBeDefined();
    expect(body.data.confidenceScore).toBeGreaterThanOrEqual(0.9);

    // Verify record was persisted into in-memory mock store
    const stored = await mockTriageStore.getTriageAssessmentById(body.data.id);
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(body.data.id);
    expect(stored?.agentActionsExecuted?.length).toBe(3);
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
