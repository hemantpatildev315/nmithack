/**
 * @file types.ts
 * @description Core domain schemas, strict TypeScript types, and validation contracts
 * for the Autonomous Healthcare Triage & Emergency Resource Allocation Agent.
 * Enforces zero implicit any, runtime Zod boundary guards, and exhaustive TSDoc annotations.
 */

import { z } from "zod";

// ==============================================================================
// 1. Vitals Schema & Physiological Validation
// ==============================================================================

/**
 * Zod schema enforcing physiological thresholds for vital sign parameters.
 * Validates heart rate, blood pressure, oxygen saturation, and respiratory dynamics.
 */
export const VitalsSchema = z.object({
  /** Heart rate in beats per minute (bpm). Valid range: 20–300. */
  heartRate: z
    .number()
    .int("Heart rate must be an integer")
    .min(20, "Heart rate too low (minimum 20 bpm)")
    .max(300, "Heart rate exceeds physiological maximum (300 bpm)"),

  /** Systolic blood pressure in mmHg. Valid range: 40–300. */
  systolicBp: z
    .number()
    .int("Systolic BP must be an integer")
    .min(40, "Systolic BP too low (minimum 40 mmHg)")
    .max(300, "Systolic BP exceeds maximum (300 mmHg)"),

  /** Diastolic blood pressure in mmHg. Valid range: 20–200. */
  diastolicBp: z
    .number()
    .int("Diastolic BP must be an integer")
    .min(20, "Diastolic BP too low (minimum 20 mmHg)")
    .max(200, "Diastolic BP exceeds maximum (200 mmHg)"),

  /** Blood oxygen saturation percentage (SpO2). Valid range: 0–100%. */
  spO2: z
    .number()
    .min(0, "SpO2 cannot be negative")
    .max(100, "SpO2 cannot exceed 100%"),

  /** Respiratory rate in breaths per minute. Valid range: 4–80 bpm. */
  respiratoryRate: z
    .number()
    .int("Respiratory rate must be an integer")
    .min(4, "Respiratory rate too low (minimum 4 bpm)")
    .max(80, "Respiratory rate exceeds physiological limit (80 bpm)"),

  /** Core body temperature in degrees Celsius (°C). Optional. Valid range: 28–45°C. */
  temperatureCelsius: z
    .number()
    .min(28, "Temperature below hypothermia extreme (28°C)")
    .max(45, "Temperature above hyperthermia extreme (45°C)")
    .optional(),

  /** Glasgow Coma Scale score. Optional. Valid range: 3 (deep coma) to 15 (fully alert). */
  glasgowComaScale: z
    .number()
    .int()
    .min(3, "GCS minimum is 3 (deep unconsciousness)")
    .max(15, "GCS maximum is 15 (fully alert)")
    .optional(),
});

/** Represents validated physiological vital signs. */
export type Vitals = z.infer<typeof VitalsSchema>;

// ==============================================================================
// 2. Patient Demographics & Profile
// ==============================================================================

/**
 * Zod schema for patient demographic and baseline health profile.
 */
export const PatientSchema = z.object({
  /** Unique patient identifier (UUID or MRN). */
  id: z.string().min(1, "Patient ID is required"),

  /** Full legal name of the patient. */
  name: z.string().min(1, "Patient name is required"),

  /** Patient age in completed years. Valid range: 0–125. */
  age: z
    .number()
    .int()
    .min(0, "Age cannot be negative")
    .max(125, "Age exceeds valid human lifespan"),

  /** Biological gender classification for normative clinical comparisons. */
  gender: z.enum(["male", "female", "other"]),

  /** Chief complaint or primary presenting symptom. */
  chiefComplaint: z.string().min(2, "Chief complaint is required"),

  /** Array of known pre-existing medical conditions. Defaults to empty array. */
  medicalHistory: z.array(z.string()).default([]),

  /** Array of documented drug or environmental allergies. Defaults to empty array. */
  allergies: z.array(z.string()).default([]),
});

/** Represents validated patient demographics. */
export type Patient = z.infer<typeof PatientSchema>;

// ==============================================================================
// 3. Acuity Score & ESI Triage Categories
// ==============================================================================

/** Emergency Severity Index levels (1 = highest urgency, 5 = lowest). */
export const EsiLevelEnum = z.enum(["1", "2", "3", "4", "5"]);
export type EsiLevel = 1 | 2 | 3 | 4 | 5;

/** Standard clinical ESI urgency categories. */
export const EsiCategoryEnum = z.enum([
  "IMMEDIATE",
  "EMERGENT",
  "URGENT",
  "LESS_URGENT",
  "NON_URGENT",
]);
export type EsiCategory = z.infer<typeof EsiCategoryEnum>;

/**
 * Schema representing the output of deterministic clinical triage calculations.
 */
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

/** Represents an evaluated acuity calculation score. */
export type AcuityScore = z.infer<typeof AcuityScoreSchema>;

// ==============================================================================
// 4. Department Capacity & Emergency Resource Allocation
// ==============================================================================

/** Hospital department types available for emergency triage placement. */
export const DepartmentTypeEnum = z.enum([
  "ICU",
  "ER",
  "General Ward",
  "Fast Track",
]);
export type DepartmentType = z.infer<typeof DepartmentTypeEnum>;

/**
 * Real-time capacity and bed availability state for a specific hospital department.
 */
export const DepartmentCapacitySchema = z.object({
  department: DepartmentTypeEnum,
  totalBeds: z.number().int().nonnegative(),
  occupiedBeds: z.number().int().nonnegative(),
  availableBeds: z.number().int().nonnegative(),
  utilizationRate: z.number().min(0).max(1),
  acceptingPatients: z.boolean(),
});

/** Represents department capacity telemetry. */
export type DepartmentCapacity = z.infer<typeof DepartmentCapacitySchema>;

/**
 * Output of the deterministic resource allocation and bed assignment algorithm.
 */
export const ResourceAllocationSchema = z.object({
  recommendedDepartment: DepartmentTypeEnum,
  alternativeDepartment: DepartmentTypeEnum.optional(),
  allocatedBedId: z.string().optional(),
  priorityQueueRank: z.number().int().positive(),
  estimatedWaitMinutes: z.number().int().nonnegative(),
  equipmentNeeded: z.array(z.string()),
  contingencyPlan: z.string().optional(),
});

/** Represents emergency resource and bed allocation decisions. */
export type ResourceAllocation = z.infer<typeof ResourceAllocationSchema>;

// ==============================================================================
// 5. Autonomous Agent Actions (Problem Statement Alignment)
// ==============================================================================

/**
 * Enum of autonomous agent actions executed during the triage cycle.
 * Represents side-effect decisions executed directly by the agentic pipeline.
 */
export const AgentActionTypeEnum = z.enum([
  "BED_RESERVATION_MUTATION",
  "PRIORITY_QUEUE_REINDEX",
  "CLINICAL_DISPATCH_ALERT",
  "RESOURCE_RESERVED",
  "DISPATCH_NOTIFICATION",
  "QUEUE_PRIORITY_REORDER",
]);
export type AgentActionType = z.infer<typeof AgentActionTypeEnum>;

/**
 * Schema representing an individual autonomous action executed by the triage agent.
 */
export const AgentActionSchema = z.object({
  /** Type of action executed. */
  type: AgentActionTypeEnum,
  /** Human-readable explanation of the action taken. */
  description: z.string(),
  /** ISO timestamp when the action occurred. */
  timestamp: z.string(),
  /** Structured metadata contextualizing the action. */
  metadata: z.record(z.unknown()).optional(),
});

/** Represents an autonomous action taken by the triage agent. */
export type AgentAction = z.infer<typeof AgentActionSchema>;

// ==============================================================================
// 6. Triage Assessment Record (Stored Entity & Fast O(1) Cache)
// ==============================================================================

/**
 * Complete, immutable persisted triage assessment record.
 */
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
  agentActionsExecuted: z.array(AgentActionSchema).default([]),
  actionsTaken: z.array(AgentActionSchema).default([]),
  isFallback: z.boolean(),
  timestamp: z.string(),
  executionDurationMs: z.number().nonnegative(),
  latencyMs: z.number().nonnegative().optional(),
  toolExecutionTimeMs: z.number().nonnegative().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
});

/** Represents a complete, persisted triage assessment. */
export type TriageAssessment = z.infer<typeof TriageAssessmentSchema>;

/** Semantic alias for persisted triage records in O(1) lookup stores. */
export type TriageRecord = TriageAssessment;

/**
 * Cache entry structure for LRU computation caching.
 */
export interface CacheEntry<T = unknown> {
  readonly result: T;
  readonly timestamp: number;
}

// ==============================================================================
// 7. Request / Query Schemas
// ==============================================================================

/**
 * Request payload contract for POST /api/agent.
 */
export const TriageRequestSchema = z.object({
  patient: PatientSchema,
  vitals: VitalsSchema,
  notes: z.string().optional(),
  forceFallback: z.boolean().default(false),
});

/** Inbound request payload for emergency triage processing. */
export type TriageRequest = z.infer<typeof TriageRequestSchema>;

/**
 * Query parameter schema with bounded pagination and filter support.
 */
export const TriageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  esiLevel: z.coerce.number().int().min(1).max(5).optional(),
  department: DepartmentTypeEnum.optional(),
});

/** Parsed query options for triage feed retrieval. */
export type TriageQuery = z.infer<typeof TriageQuerySchema>;

/**
 * Generic paginated response interface.
 */
export interface PaginatedResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}
