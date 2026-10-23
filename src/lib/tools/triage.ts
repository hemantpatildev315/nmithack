/**
 * @file triage.ts
 * @description Deterministic Clinical Acuity (ESI 1-5) and Emergency Resource Allocation algorithms.
 * Implements low-cyclomatic-complexity table lookups and pure predicates based on
 * the Emergency Severity Index (ESI) and National Early Warning Score (NEWS2) frameworks.
 */

import {
  Vitals,
  VitalsSchema,
  AcuityScore,
  EsiLevel,
  DepartmentCapacity,
  ResourceAllocation,
  DepartmentType,
} from "@/lib/types";

// ==============================================================================
// 1. Vital Sign Evaluation Lookup Tables (Reduced Cyclomatic Complexity)
// ==============================================================================

interface VitalRule {
  readonly predicate: (val: number) => boolean;
  readonly points: number;
  readonly message: (val: number) => string;
}

const SPO2_RULES: readonly VitalRule[] = [
  {
    predicate: (val) => val < 85,
    points: 3,
    message: (val) => `Critical Hypoxemia (SpO2: ${val}%)`,
  },
  {
    predicate: (val) => val <= 91,
    points: 2,
    message: (val) => `Severe Hypoxia (SpO2: ${val}%)`,
  },
  {
    predicate: (val) => val <= 94,
    points: 1,
    message: (val) => `Mild-Moderate Hypoxia (SpO2: ${val}%)`,
  },
];

const HEART_RATE_RULES: readonly VitalRule[] = [
  {
    predicate: (val) => val <= 40 || val >= 140,
    points: 3,
    message: (val) => `Extreme Heart Rate (${val} bpm)`,
  },
  {
    predicate: (val) => val <= 50 || val >= 115,
    points: 2,
    message: (val) => `Marked Arrhythmia/Tachycardia (${val} bpm)`,
  },
  {
    predicate: (val) => val <= 55 || val >= 100,
    points: 1,
    message: (val) => `Mild Heart Rate Deviation (${val} bpm)`,
  },
];

const SYSTOLIC_BP_RULES: readonly VitalRule[] = [
  {
    predicate: (val) => val < 80 || val >= 220,
    points: 3,
    message: (val) =>
      val < 80
        ? `Hypotensive Shock (Systolic: ${val} mmHg)`
        : `Hypertensive Crisis (Systolic: ${val} mmHg)`,
  },
  {
    predicate: (val) => val <= 90 || val >= 180,
    points: 2,
    message: (val) => `Significant BP Abnormality (Systolic: ${val} mmHg)`,
  },
  {
    predicate: (val) => val < 100 || val >= 140,
    points: 1,
    message: (val) => `Borderline Blood Pressure (${val} mmHg)`,
  },
];

const RESPIRATORY_RATE_RULES: readonly VitalRule[] = [
  {
    predicate: (val) => val <= 8 || val >= 35,
    points: 3,
    message: (val) => `Critical Respiratory Rate (${val} bpm)`,
  },
  {
    predicate: (val) => val <= 10 || val >= 26,
    points: 2,
    message: (val) => `Marked Tachypnea/Bradypnea (${val} bpm)`,
  },
  {
    predicate: (val) => val < 12 || val >= 21,
    points: 1,
    message: (val) => `Elevated Respiratory Rate (${val} bpm)`,
  },
];

const GCS_RULES: readonly VitalRule[] = [
  {
    predicate: (val) => val < 8,
    points: 3,
    message: (val) => `Severe Neurological Deficit (GCS: ${val})`,
  },
  {
    predicate: (val) => val <= 12,
    points: 2,
    message: (val) => `Altered Mental Status (GCS: ${val})`,
  },
  {
    predicate: (val) => val <= 14,
    points: 1,
    message: (val) => `Mild Lethargy/Confusion (GCS: ${val})`,
  },
];

/**
 * Pure helper matching a vital metric value against constant rule hierarchies.
 *
 * @param value - Numerical value of the evaluated physiological vital.
 * @param rules - Ordered array of evaluation rules.
 * @returns Evaluated point penalty and optional descriptive message.
 */
function evaluateVitalRule(
  value: number,
  rules: readonly VitalRule[]
): { points: number; message?: string } {
  const matched = rules.find((r) => r.predicate(value));
  return matched
    ? { points: matched.points, message: matched.message(value) }
    : { points: 0 };
}

// ==============================================================================
// 2. Acuity Scoring Engine
// ==============================================================================

/**
 * Calculates vital risk index and physiological risk factors using constant lookup tables.
 *
 * @param vitals - Validated patient physiological vitals.
 * @returns An object containing the normalized vital risk score (0.0–10.0) and identified risk factor strings.
 */
export function calculateVitalRiskIndex(vitals: Readonly<Vitals>): {
  score: number;
  riskFactors: string[];
} {
  const riskFactors: string[] = [];
  let rawPoints = 0;

  const evaluations = [
    evaluateVitalRule(vitals.spO2, SPO2_RULES),
    evaluateVitalRule(vitals.heartRate, HEART_RATE_RULES),
    evaluateVitalRule(vitals.systolicBp, SYSTOLIC_BP_RULES),
    evaluateVitalRule(vitals.respiratoryRate, RESPIRATORY_RATE_RULES),
    vitals.glasgowComaScale !== undefined
      ? evaluateVitalRule(vitals.glasgowComaScale, GCS_RULES)
      : { points: 0 },
  ];

  for (const ev of evaluations) {
    if (ev.points > 0 && ev.message) {
      rawPoints += ev.points;
      riskFactors.push(ev.message);
    }
  }

  // Normalize points to a 0.0 - 10.0 scale (12 raw points max normalization)
  const normalized = Math.min(10, Number(((rawPoints / 12) * 10).toFixed(2)));

  return {
    score: normalized,
    riskFactors,
  };
}

/**
 * Predicate checking whether vitals satisfy Emergency Severity Index (ESI) Level 1 criteria.
 *
 * @param vitals - Patient vital parameters.
 * @param riskScore - Normalized vital risk score.
 * @returns True if patient requires immediate resuscitation.
 */
function isEsi1Criteria(vitals: Readonly<Vitals>, riskScore: number): boolean {
  return (
    vitals.spO2 < 85 ||
    vitals.heartRate < 40 ||
    vitals.heartRate > 170 ||
    vitals.systolicBp < 70 ||
    vitals.respiratoryRate < 8 ||
    vitals.respiratoryRate > 40 ||
    (vitals.glasgowComaScale !== undefined && vitals.glasgowComaScale < 8) ||
    riskScore >= 8.5
  );
}

/**
 * Predicate checking whether vitals satisfy Emergency Severity Index (ESI) Level 2 criteria.
 *
 * @param vitals - Patient vital parameters.
 * @param riskScore - Normalized vital risk score.
 * @returns True if patient is emergent and in physiological danger.
 */
function isEsi2Criteria(vitals: Readonly<Vitals>, riskScore: number): boolean {
  return (
    vitals.spO2 < 92 ||
    vitals.heartRate < 50 ||
    vitals.heartRate > 120 ||
    vitals.systolicBp < 90 ||
    vitals.systolicBp > 200 ||
    vitals.respiratoryRate < 10 ||
    vitals.respiratoryRate > 28 ||
    (vitals.glasgowComaScale !== undefined && vitals.glasgowComaScale <= 12) ||
    riskScore >= 4.0
  );
}

/**
 * Predicate checking whether vitals satisfy Emergency Severity Index (ESI) Level 3 criteria.
 *
 * @param vitals - Patient vital parameters.
 * @param riskScore - Normalized vital risk score.
 * @returns True if patient is urgent and requires multiple diagnostic resources.
 */
function isEsi3Criteria(vitals: Readonly<Vitals>, riskScore: number): boolean {
  return (
    vitals.heartRate >= 100 ||
    vitals.heartRate <= 55 ||
    vitals.systolicBp >= 140 ||
    vitals.systolicBp <= 98 ||
    vitals.respiratoryRate >= 21 ||
    vitals.spO2 <= 95 ||
    riskScore >= 1.5
  );
}

/**
 * Pure, deterministic algorithm calculating Emergency Severity Index (ESI Level 1–5).
 * Validates inputs strictly using Zod and produces reproducible clinical flags.
 *
 * @param rawVitals - Inbound patient vital signs payload.
 * @returns Fully computed AcuityScore object.
 * @throws {z.ZodError} If vitals violate physiological boundaries.
 */
export function calculateAcuity(rawVitals: Readonly<Vitals>): AcuityScore {
  const vitals = VitalsSchema.parse(rawVitals);
  const { score: vitalRiskScore, riskFactors } = calculateVitalRiskIndex(vitals);

  if (isEsi1Criteria(vitals, vitalRiskScore)) {
    return {
      esiLevel: 1,
      esiCategory: "IMMEDIATE",
      vitalRiskScore,
      riskFactors,
      isCritical: true,
      clinicalFlag: "CRITICAL_RESUSCITATION",
    };
  }

  if (isEsi2Criteria(vitals, vitalRiskScore)) {
    return {
      esiLevel: 2,
      esiCategory: "EMERGENT",
      vitalRiskScore,
      riskFactors,
      isCritical: true,
      clinicalFlag: "HIGH_RISK_EMERGENT",
    };
  }

  if (isEsi3Criteria(vitals, vitalRiskScore)) {
    return {
      esiLevel: 3,
      esiCategory: "URGENT",
      vitalRiskScore,
      riskFactors,
      isCritical: false,
      clinicalFlag: "URGENT_OBSERVATION",
    };
  }

  if (vitalRiskScore > 0) {
    return {
      esiLevel: 4,
      esiCategory: "LESS_URGENT",
      vitalRiskScore,
      riskFactors,
      isCritical: false,
      clinicalFlag: "LESS_URGENT_EVALUATION",
    };
  }

  return {
    esiLevel: 5,
    esiCategory: "NON_URGENT",
    vitalRiskScore,
    riskFactors,
    isCritical: false,
    clinicalFlag: "ROUTINE_AMBULATORY",
  };
}

// ==============================================================================
// 3. Department Allocation Lookup Matrix (Clean Architecture)
// ==============================================================================

interface DepartmentPolicy {
  readonly primaryDept: DepartmentType;
  readonly secondaryDept: DepartmentType;
  readonly priorityRank: number;
  readonly defaultWaitMinutes: number;
  readonly equipment: readonly string[];
}

const ALLOCATION_POLICIES: Record<EsiLevel, DepartmentPolicy> = {
  1: {
    primaryDept: "ICU",
    secondaryDept: "ER",
    priorityRank: 1,
    defaultWaitMinutes: 0,
    equipment: [
      "Continuous Cardiac Monitor",
      "Mechanical Ventilator / High-Flow O2",
      "Arterial Line / Rapid Infuser",
      "Defibrillator on Standby",
    ],
  },
  2: {
    primaryDept: "ER",
    secondaryDept: "ICU",
    priorityRank: 2,
    defaultWaitMinutes: 5,
    equipment: [
      "Continuous Pulse Oximetry",
      "ECG 12-Lead",
      "IV Access & Stat Labs",
      "Dedicated RN Monitoring",
    ],
  },
  3: {
    primaryDept: "ER",
    secondaryDept: "General Ward",
    priorityRank: 3,
    defaultWaitMinutes: 30,
    equipment: ["Intermittent Vitals Monitor", "Standard Lab Blood Draw"],
  },
  4: {
    primaryDept: "Fast Track",
    secondaryDept: "General Ward",
    priorityRank: 4,
    defaultWaitMinutes: 60,
    equipment: ["Basic Examination Tools"],
  },
  5: {
    primaryDept: "Fast Track",
    secondaryDept: "General Ward",
    priorityRank: 5,
    defaultWaitMinutes: 90,
    equipment: ["Standard Outpatient Triage Kit"],
  },
};

/**
 * Deterministically assigns a hospital department, queue priority rank, and life-support equipment
 * matching patient clinical acuity with real-time department bed capacity.
 *
 * @param acuity - Evaluated patient acuity and ESI score.
 * @param capacities - Real-time hospital department bed availability states.
 * @returns ResourceAllocation decision payload.
 */
export function matchResourceAllocation(
  acuity: Readonly<AcuityScore>,
  capacities: readonly DepartmentCapacity[]
): ResourceAllocation {
  const policy = ALLOCATION_POLICIES[acuity.esiLevel];
  const findDept = (dept: DepartmentType) => capacities.find((c) => c.department === dept);

  const primary = findDept(policy.primaryDept);
  const secondary = findDept(policy.secondaryDept);

  let recommendedDepartment: DepartmentType;
  let alternativeDepartment: DepartmentType | undefined;

  // Check bed availability: prefer primary if beds exist, otherwise divert to secondary
  if (primary && primary.availableBeds > 0) {
    recommendedDepartment = policy.primaryDept;
    alternativeDepartment = policy.secondaryDept;
  } else if (secondary && secondary.availableBeds > 0) {
    recommendedDepartment = policy.secondaryDept;
    alternativeDepartment = policy.primaryDept;
  } else {
    recommendedDepartment = policy.primaryDept;
    alternativeDepartment = policy.secondaryDept;
  }

  const waitMinutes =
    policy.priorityRank === 1
      ? 0
      : Math.min(
          policy.defaultWaitMinutes * 2,
          Math.max(policy.defaultWaitMinutes, (primary?.occupiedBeds ?? 0) * 2)
        );

  const targetDept = findDept(recommendedDepartment);
  const contingencyPlan =
    targetDept && targetDept.availableBeds === 0
      ? `Primary department ${recommendedDepartment} is at capacity (${targetDept.occupiedBeds}/${targetDept.totalBeds}). Divert to ${alternativeDepartment ?? "Overflow Area"} immediately.`
      : undefined;

  return {
    recommendedDepartment,
    alternativeDepartment,
    priorityQueueRank: policy.priorityRank,
    estimatedWaitMinutes: waitMinutes,
    equipmentNeeded: [...policy.equipment],
    contingencyPlan,
  };
}
