/**
 * @file triage.ts
 * @description Deterministic clinical triage algorithms based on the Emergency Severity Index (ESI)
 * and vital sign risk scoring. Implements a declarative rule matrix and constant lookup tables
 * to eliminate nested branching, minimize cyclomatic complexity, and guarantee sub-millisecond execution.
 */

import {
  Vitals,
  VitalsSchema,
  AcuityScore,
  EsiCategory,
  EsiLevel,
  ResourceAllocation,
  DepartmentCapacity,
  DepartmentType,
} from "@/lib/types";

// ==============================================================================
// 1. Declarative Constant Lookup Tables for Vital Risk Scoring
// ==============================================================================

/**
 * Oxygen saturation rule criteria for vital risk calculation.
 */
export interface SpO2Rule {
  readonly max: number;
  readonly score: number;
  readonly message: string;
}

export const SPO2_RULES: readonly SpO2Rule[] = [
  { max: 85, score: 3.5, message: "Critical Hypoxemia (SpO2 <= 85%)" },
  { max: 90, score: 2.5, message: "Severe Hypoxia (SpO2 86-90%)" },
  { max: 94, score: 1.0, message: "Mild Hypoxemia (SpO2 91-94%)" },
] as const;

/**
 * Heart rate risk rule criteria.
 */
export interface HeartRateRule {
  readonly min?: number;
  readonly max?: number;
  readonly score: number;
  readonly message: string;
}

export const HEART_RATE_RULES: readonly HeartRateRule[] = [
  { min: 140, score: 3.0, message: "Extreme Heart Rate / Tachycardia (HR >= 140 bpm)" },
  { max: 40, score: 3.0, message: "Severe Bradycardia (HR <= 40 bpm)" },
  { min: 110, score: 1.5, message: "Moderate Tachycardia (HR 110-139 bpm)" },
  { max: 50, score: 1.5, message: "Moderate Bradycardia (HR 41-50 bpm)" },
] as const;

/**
 * Systolic blood pressure hemodynamic risk rule criteria.
 */
export interface SystolicBpRule {
  readonly min?: number;
  readonly max?: number;
  readonly score: number;
  readonly message: string;
}

export const SYSTOLIC_BP_RULES: readonly SystolicBpRule[] = [
  { max: 80, score: 3.5, message: "Hypotensive Shock (Systolic BP <= 80 mmHg)" },
  { min: 200, score: 3.0, message: "Hypertensive Crisis (Systolic BP >= 200 mmHg)" },
  { max: 90, score: 2.0, message: "Significant Hypotension (Systolic BP 81-90 mmHg)" },
  { min: 180, score: 1.5, message: "Marked Hypertension (Systolic BP 180-199 mmHg)" },
] as const;

/**
 * Respiratory rate risk rule criteria.
 */
export interface RespiratoryRateRule {
  readonly min?: number;
  readonly max?: number;
  readonly score: number;
  readonly message: string;
}

export const RESPIRATORY_RATE_RULES: readonly RespiratoryRateRule[] = [
  { min: 35, score: 3.0, message: "Severe Tachypnea (RR >= 35 breaths/min)" },
  { max: 8, score: 3.5, message: "Respiratory Failure / Bradypnea (RR <= 8 breaths/min)" },
  { min: 26, score: 1.5, message: "Moderate Tachypnea (RR 26-34 breaths/min)" },
  { max: 10, score: 2.0, message: "Depressed Respiration (RR 9-10 breaths/min)" },
] as const;

/**
 * Glasgow Coma Scale neurological risk rule criteria.
 */
export interface GcsRule {
  readonly max: number;
  readonly score: number;
  readonly message: string;
}

export const GCS_RULES: readonly GcsRule[] = [
  { max: 8, score: 4.0, message: "Severe Neurological Coma (GCS <= 8)" },
  { max: 12, score: 2.5, message: "Moderate Neurological Impairment (GCS 9-12)" },
  { max: 14, score: 1.0, message: "Mild Neurological Confusion (GCS 13-14)" },
] as const;

// ==============================================================================
// 2. Declarative ESI Evaluation Matrix
// ==============================================================================

/**
 * Rule configuration contract for declarative ESI acuity mapping.
 */
export interface EsiEvaluationRule {
  readonly level: EsiLevel;
  readonly category: EsiCategory;
  readonly clinicalFlag: string;
  readonly isCritical: boolean;
  readonly predicate: (vitals: Readonly<Vitals>, score: number) => boolean;
}

/**
 * Declarative rule matrix ordered strictly by clinical urgency (ESI 1 to 4).
 * Evaluated top-to-bottom to guarantee deterministic priority resolution.
 */
export const ESI_EVALUATION_MATRIX: readonly EsiEvaluationRule[] = [
  {
    level: 1,
    category: "IMMEDIATE",
    clinicalFlag: "RESUSCITATION_REQUIRED",
    isCritical: true,
    predicate: (vitals: Readonly<Vitals>, score: number): boolean =>
      (vitals.glasgowComaScale !== undefined && vitals.glasgowComaScale <= 8) ||
      vitals.spO2 < 80 ||
      vitals.systolicBp < 70 ||
      vitals.respiratoryRate <= 6 ||
      vitals.respiratoryRate >= 45 ||
      vitals.heartRate <= 35 ||
      vitals.heartRate >= 180 ||
      score >= 8.5,
  },
  {
    level: 2,
    category: "EMERGENT",
    clinicalFlag: "HIGH_RISK_EMERGENT",
    isCritical: true,
    predicate: (vitals: Readonly<Vitals>, score: number): boolean =>
      score >= 3.0 ||
      vitals.spO2 < 92 ||
      vitals.systolicBp < 90 ||
      vitals.systolicBp >= 190 ||
      vitals.heartRate > 120 ||
      vitals.heartRate < 45 ||
      vitals.respiratoryRate >= 28 ||
      vitals.respiratoryRate < 10 ||
      (vitals.glasgowComaScale !== undefined && vitals.glasgowComaScale <= 13),
  },
  {
    level: 3,
    category: "URGENT",
    clinicalFlag: "URGENT_DIAGNOSTICS_NEEDED",
    isCritical: false,
    predicate: (vitals: Readonly<Vitals>, score: number): boolean =>
      score >= 1.5 ||
      vitals.spO2 <= 95 ||
      vitals.systolicBp < 100 ||
      vitals.systolicBp >= 160 ||
      vitals.heartRate >= 100 ||
      vitals.heartRate <= 55 ||
      vitals.respiratoryRate >= 22 ||
      (vitals.temperatureCelsius !== undefined &&
        (vitals.temperatureCelsius >= 38.5 || vitals.temperatureCelsius <= 35.5)),
  },
  {
    level: 4,
    category: "LESS_URGENT",
    clinicalFlag: "SIMPLE_RESOURCE_CARE",
    isCritical: false,
    predicate: (vitals: Readonly<Vitals>, score: number): boolean =>
      score > 0 ||
      (vitals.temperatureCelsius !== undefined && vitals.temperatureCelsius >= 38.0),
  },
] as const;

/**
 * Pure helper predicate evaluating if patient telemetry meets ESI Level 1 criteria.
 *
 * @param vitals - Verified patient physiological vital signs.
 * @param vitalScore - Computed composite vital sign risk index.
 * @returns True if immediate resuscitation is required; false otherwise.
 * @throws Never throws under valid Vitals inputs.
 */
export function isEsi1Criteria(vitals: Readonly<Vitals>, vitalScore: number): boolean {
  const rule = ESI_EVALUATION_MATRIX[0];
  return rule ? rule.predicate(vitals, vitalScore) : false;
}

export function isEsi2Criteria(vitals: Readonly<Vitals>, vitalScore: number): boolean {
  const rule = ESI_EVALUATION_MATRIX[1];
  return rule ? rule.predicate(vitals, vitalScore) : false;
}

export function isEsi3Criteria(vitals: Readonly<Vitals>, vitalScore: number): boolean {
  const rule = ESI_EVALUATION_MATRIX[2];
  return rule ? rule.predicate(vitals, vitalScore) : false;
}

// ==============================================================================
// 3. Deterministic Vital Risk Index Engine
// ==============================================================================

/**
 * Computes a standardized numerical risk index and extracts specific risk factor descriptions.
 * Uses constant lookup tables for zero cyclomatic overhead.
 *
 * @param vitals - Patient physiological vitals payload.
 * @returns An object containing the aggregated score and identified clinical risk factors.
 * @throws Never throws; all vital ranges are clamped and guarded by upstream Zod schemas.
 */
export function calculateVitalRiskIndex(vitals: Readonly<Vitals>): {
  score: number;
  riskFactors: string[];
} {
  let score = 0;
  const riskFactors: string[] = [];

  // 1. Oxygen Saturation Evaluation
  for (const rule of SPO2_RULES) {
    if (vitals.spO2 <= rule.max) {
      score += rule.score;
      riskFactors.push(rule.message);
      break;
    }
  }

  // 2. Heart Rate Evaluation
  for (const rule of HEART_RATE_RULES) {
    if (rule.min !== undefined && vitals.heartRate >= rule.min) {
      score += rule.score;
      riskFactors.push(rule.message);
      break;
    }
    if (rule.max !== undefined && vitals.heartRate <= rule.max) {
      score += rule.score;
      riskFactors.push(rule.message);
      break;
    }
  }

  // 3. Systolic Blood Pressure Evaluation
  for (const rule of SYSTOLIC_BP_RULES) {
    if (rule.max !== undefined && vitals.systolicBp <= rule.max) {
      score += rule.score;
      riskFactors.push(rule.message);
      break;
    }
    if (rule.min !== undefined && vitals.systolicBp >= rule.min) {
      score += rule.score;
      riskFactors.push(rule.message);
      break;
    }
  }

  // 4. Respiratory Rate Evaluation
  for (const rule of RESPIRATORY_RATE_RULES) {
    if (rule.min !== undefined && vitals.respiratoryRate >= rule.min) {
      score += rule.score;
      riskFactors.push(rule.message);
      break;
    }
    if (rule.max !== undefined && vitals.respiratoryRate <= rule.max) {
      score += rule.score;
      riskFactors.push(rule.message);
      break;
    }
  }

  // 5. Glasgow Coma Scale (Optional)
  if (vitals.glasgowComaScale !== undefined) {
    for (const rule of GCS_RULES) {
      if (vitals.glasgowComaScale <= rule.max) {
        score += rule.score;
        riskFactors.push(rule.message);
        break;
      }
    }
  }

  // Normalize points to a 0.0 - 10.0 scale (12 raw points max normalization)
  const normalized = Math.min(10, Number(((score / 12) * 10).toFixed(2)));

  return {
    score: normalized,
    riskFactors,
  };
}

// ==============================================================================
// 4. Acuity Score Calculation
// ==============================================================================

/**
 * Evaluates patient vital signs against the Emergency Severity Index (ESI) 5-tier classification.
 * Executes the declarative rule matrix with zero nested branching.
 *
 * @param rawVitals - Inbound patient physiological vital signs.
 * @returns Fully computed AcuityScore object with category, risk factors, and clinical flag.
 * @throws {z.ZodError} If vitals violate physiological boundaries.
 */
export function calculateAcuity(rawVitals: Readonly<Vitals>): AcuityScore {
  const vitals = VitalsSchema.parse(rawVitals);
  const { score: vitalRiskScore, riskFactors } = calculateVitalRiskIndex(vitals);

  const matchedRule = ESI_EVALUATION_MATRIX.find((rule) =>
    rule.predicate(vitals, vitalRiskScore)
  );

  if (matchedRule) {
    return {
      esiLevel: matchedRule.level,
      esiCategory: matchedRule.category,
      vitalRiskScore,
      riskFactors,
      isCritical: matchedRule.isCritical,
      clinicalFlag: matchedRule.clinicalFlag,
    };
  }

  return {
    esiLevel: 5,
    esiCategory: "NON_URGENT" as EsiCategory,
    vitalRiskScore: 0,
    riskFactors: [],
    isCritical: false,
    clinicalFlag: "ROUTINE_AMBULATORY_CARE",
  };
}

// ==============================================================================
// 5. Deterministic Hospital Resource Allocation Matrix
// ==============================================================================

/**
 * Policy structure defining hospital department priority, wait target, and equipment requirements.
 */
export interface AllocationPolicy {
  readonly preferred: DepartmentType;
  readonly fallback: DepartmentType;
  readonly priorityRank: number;
  readonly waitMinutes: number;
  readonly equipment: readonly string[];
}

export const ALLOCATION_POLICIES: Readonly<Record<number, AllocationPolicy>> = {
  1: {
    preferred: "ICU",
    fallback: "ER",
    priorityRank: 1,
    waitMinutes: 0,
    equipment: ["Ventilator / BiPAP", "Cardiac Monitor & Defibrillator", "Stat Blood Gas Kit", "Arterial Line Setup"],
  },
  2: {
    preferred: "ER",
    fallback: "ICU",
    priorityRank: 2,
    waitMinutes: 5,
    equipment: ["Continuous Pulse Oximetry", "ECG 12-Lead", "IV Access & Stat Labs", "Dedicated RN Monitoring"],
  },
  3: {
    preferred: "ER",
    fallback: "General Ward",
    priorityRank: 3,
    waitMinutes: 30,
    equipment: ["Vital Signs Monitor", "Standard IV Kit", "Point of Care Blood Labs"],
  },
  4: {
    preferred: "Fast Track",
    fallback: "General Ward",
    priorityRank: 4,
    waitMinutes: 60,
    equipment: ["Basic Examination Kit", "Rapid Diagnostic Swabs"],
  },
  5: {
    preferred: "Fast Track",
    fallback: "General Ward",
    priorityRank: 5,
    waitMinutes: 90,
    equipment: ["Standard Exam Bed"],
  },
} as const;

/**
 * Deterministically assigns hospital department, equipment, and priority ranking
 * based on calculated acuity and available bed capacity.
 *
 * @param acuity - The computed AcuityScore for the patient.
 * @param capacities - Real-time hospital department capacity snapshots.
 * @returns Final ResourceAllocation plan with equipment requirements and wait estimation.
 * @throws Never throws under valid inputs.
 */
export function matchResourceAllocation(
  acuity: Readonly<AcuityScore>,
  capacities: readonly DepartmentCapacity[]
): ResourceAllocation {
  const defaultPolicy: AllocationPolicy = ALLOCATION_POLICIES[5] as AllocationPolicy;
  const policy: AllocationPolicy = (ALLOCATION_POLICIES[acuity.esiLevel] ?? defaultPolicy) as AllocationPolicy;
  const capacityMap = new Map<DepartmentType, DepartmentCapacity>(
    capacities.map((c) => [c.department, c])
  );

  const preferredCap = capacityMap.get(policy.preferred);
  const fallbackCap = capacityMap.get(policy.fallback);

  let targetDepartment: DepartmentType = policy.preferred;
  let alternativeDepartment: DepartmentType | undefined = policy.fallback;

  if (preferredCap && preferredCap.availableBeds <= 0) {
    if (fallbackCap && fallbackCap.availableBeds > 0) {
      targetDepartment = policy.fallback;
      alternativeDepartment = policy.preferred;
    }
  }

  const assignedCap = capacityMap.get(targetDepartment);
  const allocatedBedId = assignedCap && assignedCap.availableBeds > 0
    ? `${targetDepartment.replace(/\s+/g, "").toUpperCase()}-BAY-${assignedCap.occupiedBeds + 1}`
    : undefined;

  let estimatedWaitMinutes = policy.waitMinutes;
  if (assignedCap && assignedCap.utilizationRate >= 0.9) {
    estimatedWaitMinutes += 15;
  }

  return {
    recommendedDepartment: targetDepartment,
    alternativeDepartment,
    allocatedBedId,
    priorityQueueRank: policy.priorityRank,
    estimatedWaitMinutes,
    equipmentNeeded: [...policy.equipment],
  };
}
