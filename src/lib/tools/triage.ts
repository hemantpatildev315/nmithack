import {
  Vitals,
  VitalsSchema,
  AcuityScore,
  EsiLevel,
  EsiCategory,
  DepartmentCapacity,
  ResourceAllocation,
  DepartmentType,
} from "@/lib/types";

/**
 * Calculates vital risk points based on clinical Early Warning Score principles.
 * Returns a normalized score between 0.0 (normal) and 10.0 (extreme physiological collapse).
 */
export function calculateVitalRiskIndex(vitals: Vitals): {
  score: number;
  riskFactors: string[];
} {
  const riskFactors: string[] = [];
  let rawPoints = 0;

  // 1. SpO2 (Oxygen Saturation)
  if (vitals.spO2 < 85) {
    rawPoints += 3;
    riskFactors.push(`Critical Hypoxemia (SpO2: ${vitals.spO2}%)`);
  } else if (vitals.spO2 <= 91) {
    rawPoints += 2;
    riskFactors.push(`Severe Hypoxia (SpO2: ${vitals.spO2}%)`);
  } else if (vitals.spO2 <= 94) {
    rawPoints += 1;
    riskFactors.push(`Mild-Moderate Hypoxia (SpO2: ${vitals.spO2}%)`);
  }

  // 2. Heart Rate (bpm)
  if (vitals.heartRate <= 40 || vitals.heartRate >= 140) {
    rawPoints += 3;
    riskFactors.push(`Extreme Heart Rate (${vitals.heartRate} bpm)`);
  } else if (vitals.heartRate <= 50 || vitals.heartRate >= 115) {
    rawPoints += 2;
    riskFactors.push(`Marked Arrhythmia/Tachycardia (${vitals.heartRate} bpm)`);
  } else if (vitals.heartRate <= 55 || vitals.heartRate >= 100) {
    rawPoints += 1;
    riskFactors.push(`Mild Heart Rate Deviation (${vitals.heartRate} bpm)`);
  }

  // 3. Systolic Blood Pressure (mmHg)
  if (vitals.systolicBp < 80 || vitals.systolicBp >= 220) {
    rawPoints += 3;
    riskFactors.push(
      vitals.systolicBp < 80
        ? `Hypotensive Shock (Systolic: ${vitals.systolicBp} mmHg)`
        : `Hypertensive Crisis (Systolic: ${vitals.systolicBp} mmHg)`
    );
  } else if (vitals.systolicBp <= 90 || vitals.systolicBp >= 180) {
    rawPoints += 2;
    riskFactors.push(`Significant BP Abnormality (Systolic: ${vitals.systolicBp} mmHg)`);
  } else if (vitals.systolicBp < 100 || vitals.systolicBp >= 140) {
    rawPoints += 1;
    riskFactors.push(`Borderline Blood Pressure (${vitals.systolicBp}/${vitals.diastolicBp} mmHg)`);
  }

  // 4. Respiratory Rate (breaths/min)
  if (vitals.respiratoryRate <= 8 || vitals.respiratoryRate >= 35) {
    rawPoints += 3;
    riskFactors.push(`Critical Respiratory Rate (${vitals.respiratoryRate} bpm)`);
  } else if (vitals.respiratoryRate <= 10 || vitals.respiratoryRate >= 26) {
    rawPoints += 2;
    riskFactors.push(`Marked Tachypnea/Bradypnea (${vitals.respiratoryRate} bpm)`);
  } else if (vitals.respiratoryRate < 12 || vitals.respiratoryRate >= 21) {
    rawPoints += 1;
    riskFactors.push(`Elevated Respiratory Rate (${vitals.respiratoryRate} bpm)`);
  }

  // 5. Glasgow Coma Scale (if present)
  if (vitals.glasgowComaScale !== undefined) {
    if (vitals.glasgowComaScale < 8) {
      rawPoints += 3;
      riskFactors.push(`Severe Neurological Deficit (GCS: ${vitals.glasgowComaScale})`);
    } else if (vitals.glasgowComaScale <= 12) {
      rawPoints += 2;
      riskFactors.push(`Altered Mental Status (GCS: ${vitals.glasgowComaScale})`);
    } else if (vitals.glasgowComaScale <= 14) {
      rawPoints += 1;
      riskFactors.push(`Mild Lethargy/Confusion (GCS: ${vitals.glasgowComaScale})`);
    }
  }

  // Max realistic points is 15 -> normalize to 0.0 - 10.0 scale
  const normalized = Math.min(10, Number(((rawPoints / 12) * 10).toFixed(2)));

  return {
    score: normalized,
    riskFactors,
  };
}

/**
 * Pure deterministic triage acuity engine.
 * Validates inputs strictly with Zod and determines ESI Level (1-5).
 */
export function calculateAcuity(rawVitals: Vitals): AcuityScore {
  // 1. Strict Zod input validation
  const vitals = VitalsSchema.parse(rawVitals);

  // 2. Calculate vital risk index
  const { score: vitalRiskScore, riskFactors } = calculateVitalRiskIndex(vitals);

  // 3. ESI Classification Hierarchy
  let esiLevel: EsiLevel;
  let esiCategory: EsiCategory;
  let isCritical = false;
  let clinicalFlag = "STABLE";

  // Tier 1: ESI Level 1 (IMMEDIATE / Resuscitation)
  // Immediate life-threatening instability
  const isEsi1 =
    vitals.spO2 < 85 ||
    vitals.heartRate < 40 ||
    vitals.heartRate > 170 ||
    vitals.systolicBp < 70 ||
    vitals.respiratoryRate < 8 ||
    vitals.respiratoryRate > 40 ||
    (vitals.glasgowComaScale !== undefined && vitals.glasgowComaScale < 8) ||
    vitalRiskScore >= 8.5;

  if (isEsi1) {
    esiLevel = 1;
    esiCategory = "IMMEDIATE";
    isCritical = true;
    clinicalFlag = "CRITICAL_RESUSCITATION";
    return {
      esiLevel,
      esiCategory,
      vitalRiskScore,
      riskFactors,
      isCritical,
      clinicalFlag,
    };
  }

  // Tier 2: ESI Level 2 (EMERGENT / High Risk)
  // High risk, severe vital sign abnormalities, or altered mental status
  const isEsi2 =
    vitals.spO2 < 92 ||
    vitals.heartRate < 50 ||
    vitals.heartRate > 120 ||
    vitals.systolicBp < 90 ||
    vitals.systolicBp > 200 ||
    vitals.respiratoryRate < 10 ||
    vitals.respiratoryRate > 28 ||
    (vitals.glasgowComaScale !== undefined && vitals.glasgowComaScale <= 12) ||
    vitalRiskScore >= 4.0;

  if (isEsi2) {
    esiLevel = 2;
    esiCategory = "EMERGENT";
    isCritical = true;
    clinicalFlag = "HIGH_RISK_EMERGENT";
    return {
      esiLevel,
      esiCategory,
      vitalRiskScore,
      riskFactors,
      isCritical,
      clinicalFlag,
    };
  }

  // Tier 3: ESI Level 3 (URGENT)
  // Borderline vitals, requires multiple resources
  const isEsi3 =
    vitals.heartRate >= 100 ||
    vitals.heartRate <= 55 ||
    vitals.systolicBp >= 140 ||
    vitals.systolicBp <= 98 ||
    vitals.respiratoryRate >= 21 ||
    vitals.spO2 <= 95 ||
    vitalRiskScore >= 1.5;

  if (isEsi3) {
    esiLevel = 3;
    esiCategory = "URGENT";
    isCritical = false;
    clinicalFlag = "URGENT_OBSERVATION";
    return {
      esiLevel,
      esiCategory,
      vitalRiskScore,
      riskFactors,
      isCritical,
      clinicalFlag,
    };
  }

  // Tier 4: ESI Level 4 (LESS_URGENT)
  if (vitalRiskScore > 0) {
    esiLevel = 4;
    esiCategory = "LESS_URGENT";
    isCritical = false;
    clinicalFlag = "LESS_URGENT_EVALUATION";
  } else {
    // Tier 5: ESI Level 5 (NON_URGENT)
    esiLevel = 5;
    esiCategory = "NON_URGENT";
    isCritical = false;
    clinicalFlag = "ROUTINE_AMBULATORY";
  }

  return {
    esiLevel,
    esiCategory,
    vitalRiskScore,
    riskFactors,
    isCritical,
    clinicalFlag,
  };
}

/**
 * Deterministic Emergency Resource Allocation algorithm.
 * Matches patient acuity with real-time hospital department bed availability.
 */
export function matchResourceAllocation(
  acuity: AcuityScore,
  capacities: DepartmentCapacity[]
): ResourceAllocation {
  const getDept = (name: DepartmentType) => capacities.find((c) => c.department === name);

  const icu = getDept("ICU");
  const er = getDept("ER");
  const generalWard = getDept("General Ward");
  const fastTrack = getDept("Fast Track");

  let recommendedDepartment: DepartmentType;
  let alternativeDepartment: DepartmentType | undefined;
  let priorityQueueRank: number;
  let estimatedWaitMinutes: number;
  const equipmentNeeded: string[] = [];

  switch (acuity.esiLevel) {
    case 1:
      // Level 1: Immediate resuscitation -> ICU or Trauma Bay (ER)
      if (icu && icu.availableBeds > 0) {
        recommendedDepartment = "ICU";
        alternativeDepartment = "ER";
      } else {
        recommendedDepartment = "ER";
        alternativeDepartment = "ICU";
      }
      priorityQueueRank = 1;
      estimatedWaitMinutes = 0; // Immediate
      equipmentNeeded.push(
        "Continuous Cardiac Monitor",
        "Mechanical Ventilator / High-Flow O2",
        "Arterial Line / Rapid Infuser",
        "Defibrillator on Standby"
      );
      break;

    case 2:
      // Level 2: Emergent -> ER (Trauma/Acute) or Stepdown
      if (er && er.availableBeds > 0) {
        recommendedDepartment = "ER";
        alternativeDepartment = "ICU";
      } else if (icu && icu.availableBeds > 0) {
        recommendedDepartment = "ICU";
        alternativeDepartment = "ER";
      } else {
        recommendedDepartment = "ER";
      }
      priorityQueueRank = 2;
      estimatedWaitMinutes = Math.min(10, Math.max(0, (er?.occupiedBeds ?? 5) * 2));
      equipmentNeeded.push(
        "Continuous Pulse Oximetry",
        "ECG 12-Lead",
        "IV Access & Stat Labs",
        "Dedicated RN Monitoring"
      );
      break;

    case 3:
      // Level 3: Urgent -> ER observation or General Ward
      if (er && er.availableBeds > 0) {
        recommendedDepartment = "ER";
        alternativeDepartment = "General Ward";
      } else if (generalWard && generalWard.availableBeds > 0) {
        recommendedDepartment = "General Ward";
        alternativeDepartment = "ER";
      } else {
        recommendedDepartment = "General Ward";
        alternativeDepartment = "ER";
      }
      priorityQueueRank = 3;
      estimatedWaitMinutes = 30;
      equipmentNeeded.push("Intermittent Vitals Monitor", "Standard Lab Blood Draw");
      break;

    case 4:
      // Level 4: Less Urgent -> Fast Track or General Ward
      if (fastTrack && fastTrack.availableBeds > 0) {
        recommendedDepartment = "Fast Track";
        alternativeDepartment = "General Ward";
      } else {
        recommendedDepartment = "General Ward";
      }
      priorityQueueRank = 4;
      estimatedWaitMinutes = 60;
      equipmentNeeded.push("Basic Examination Tools");
      break;

    case 5:
    default:
      // Level 5: Non-urgent -> Fast Track
      recommendedDepartment = "Fast Track";
      priorityQueueRank = 5;
      estimatedWaitMinutes = 90;
      equipmentNeeded.push("Standard Outpatient Triage Kit");
      break;
  }

  const targetDept = getDept(recommendedDepartment);
  const contingencyPlan =
    targetDept && targetDept.availableBeds === 0
      ? `Primary department ${recommendedDepartment} is at capacity (${targetDept.occupiedBeds}/${targetDept.totalBeds}). Divert to ${alternativeDepartment ?? "Overflow Area"} immediately.`
      : undefined;

  return {
    recommendedDepartment,
    alternativeDepartment,
    priorityQueueRank,
    estimatedWaitMinutes,
    equipmentNeeded,
    contingencyPlan,
  };
}
