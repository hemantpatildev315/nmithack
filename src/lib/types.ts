import { z } from "zod";

// ==============================================================================
// 1. Vitals Schema & Validation
// ==============================================================================

export const VitalsSchema = z.object({
  heartRate: z
    .number()
    .int("Heart rate must be an integer")
    .min(20, "Heart rate too low (minimum 20 bpm)")
    .max(300, "Heart rate exceeds physiological maximum (300 bpm)"),
  systolicBp: z
    .number()
    .int("Systolic BP must be an integer")
    .min(40, "Systolic BP too low (minimum 40 mmHg)")
    .max(300, "Systolic BP exceeds maximum (300 mmHg)"),
  diastolicBp: z
    .number()
    .int("Diastolic BP must be an integer")
    .min(20, "Diastolic BP too low (minimum 20 mmHg)")
    .max(200, "Diastolic BP exceeds maximum (200 mmHg)"),
  spO2: z
    .number()
    .min(0, "SpO2 cannot be negative")
    .max(100, "SpO2 cannot exceed 100%"),
  respiratoryRate: z
    .number()
    .int("Respiratory rate must be an integer")
    .min(4, "Respiratory rate too low (minimum 4 bpm)")
    .max(80, "Respiratory rate exceeds physiological limit (80 bpm)"),
  temperatureCelsius: z
    .number()
    .min(28, "Temperature below hypothermia extreme (28°C)")
    .max(45, "Temperature above hyperthermia extreme (45°C)")
    .optional(),
  glasgowComaScale: z
    .number()
    .int()
    .min(3, "GCS minimum is 3 (deep unconsciousness)")
    .max(15, "GCS maximum is 15 (fully alert)")
    .optional(),
});

export type Vitals = z.infer<typeof VitalsSchema>;

// ==============================================================================
// 2. Patient Demographics & Profile
// ==============================================================================

export const PatientSchema = z.object({
  id: z.string().min(1, "Patient ID is required"),
  name: z.string().min(1, "Patient name is required"),
  age: z
    .number()
    .int()
    .min(0, "Age cannot be negative")
    .max(125, "Age exceeds valid human lifespan"),
  gender: z.enum(["male", "female", "other"]),
  chiefComplaint: z.string().min(2, "Chief complaint is required"),
  medicalHistory: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
});

export type Patient = z.infer<typeof PatientSchema>;

// ==============================================================================
// 3. Acuity Score & ESI Triage Categories
// ==============================================================================

export const EsiLevelEnum = z.enum(["1", "2", "3", "4", "5"]);
export type EsiLevel = 1 | 2 | 3 | 4 | 5;

export const EsiCategoryEnum = z.enum([
  "IMMEDIATE",
  "EMERGENT",
  "URGENT",
  "LESS_URGENT",
  "NON_URGENT",
]);
export type EsiCategory = z.infer<typeof EsiCategoryEnum>;

export const AcuityScoreSchema = z.object({
  esiLevel: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  esiCategory: EsiCategoryEnum,
  vitalRiskScore: z.number().min(0).max(10),
  riskFactors: z.array(z.string()),
  isCritical: z.boolean(),
  clinicalFlag: z.string(),
});

export type AcuityScore = z.infer<typeof AcuityScoreSchema>;

// ==============================================================================
// 4. Department Capacity & Emergency Resource Allocation
// ==============================================================================

export const DepartmentTypeEnum = z.enum([
  "ICU",
  "ER",
  "General Ward",
  "Fast Track",
]);
export type DepartmentType = z.infer<typeof DepartmentTypeEnum>;

export const DepartmentCapacitySchema = z.object({
  department: DepartmentTypeEnum,
  totalBeds: z.number().int().nonnegative(),
  occupiedBeds: z.number().int().nonnegative(),
  availableBeds: z.number().int().nonnegative(),
  utilizationRate: z.number().min(0).max(1),
  acceptingPatients: z.boolean(),
});

export type DepartmentCapacity = z.infer<typeof DepartmentCapacitySchema>;

export const ResourceAllocationSchema = z.object({
  recommendedDepartment: DepartmentTypeEnum,
  alternativeDepartment: DepartmentTypeEnum.optional(),
  allocatedBedId: z.string().optional(),
  priorityQueueRank: z.number().int().positive(),
  estimatedWaitMinutes: z.number().int().nonnegative(),
  equipmentNeeded: z.array(z.string()),
  contingencyPlan: z.string().optional(),
});

export type ResourceAllocation = z.infer<typeof ResourceAllocationSchema>;

// ==============================================================================
// 5. Triage Assessment Record (Stored Entity)
// ==============================================================================

export const TriageAssessmentSchema = z.object({
  id: z.string(),
  patient: PatientSchema,
  vitals: VitalsSchema,
  deterministicScore: AcuityScoreSchema,
  aiReasoning: z.string(),
  clinicalSummary: z.string(),
  finalEsiLevel: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  resourceAllocation: ResourceAllocationSchema,
  isFallback: z.boolean(),
  timestamp: z.string(),
  executionDurationMs: z.number().nonnegative(),
});

export type TriageAssessment = z.infer<typeof TriageAssessmentSchema>;

// ==============================================================================
// 6. Request / Query Schemas
// ==============================================================================

export const TriageRequestSchema = z.object({
  patient: PatientSchema,
  vitals: VitalsSchema,
  notes: z.string().optional(),
  forceFallback: z.boolean().default(false),
});

export type TriageRequest = z.infer<typeof TriageRequestSchema>;

export const TriageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  esiLevel: z.coerce.number().int().min(1).max(5).optional(),
  department: DepartmentTypeEnum.optional(),
});

export type TriageQuery = z.infer<typeof TriageQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
