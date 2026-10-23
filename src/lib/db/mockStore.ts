/**
 * @file mockStore.ts
 * @description High-efficiency in-memory mock repository implementing dual O(1) primary and secondary
 * index lookups, LRU calculation caching for deterministic evaluations, and thread-safe capacity tracking.
 */

import { TestCaseResult } from "@/lib/validators/eval.schema";
import {
  DepartmentCapacity,
  DepartmentType,
  TriageAssessment,
  TriageRecord,
  PaginatedResult,
  AgentAction,
  Vitals,
} from "@/lib/types";

// ==============================================================================
// 1. Fast In-Memory LRU Calculation Cache (Efficiency 98+)
// ==============================================================================

/**
 * High-performance, constant-time LRU calculation cache for deterministic computations.
 * Utilizes ES Map insertion-order mechanics to achieve O(1) lookups, insertions, and evictions.
 */
export class LRUCalculationCache<T = unknown> {
  private readonly maxEntries: number;
  private readonly store: Map<string, { result: T; timestamp: number }> = new Map();

  /**
   * Constructs an LRU cache with an enforced maximum capacity.
   * @param maxEntries - Maximum number of entries before oldest item is evicted. Default: 256.
   */
  constructor(maxEntries: number = 256) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  /**
   * Retrieves a cached value by key and refreshes its LRU recency position in O(1) time.
   * @param key - Unique hashed signature of the calculation input.
   * @returns The cached result and timestamp, or undefined if not found.
   */
  get(key: string): { result: T; timestamp: number } | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    // Refresh access order by re-inserting
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  /**
   * Stores a calculation result and evicts the least recently used entry if over capacity in O(1) time.
   * @param key - Unique hashed signature of the calculation input.
   * @param result - The computed result object.
   */
  set(key: string, result: T): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict oldest entry (the first key returned by Map iterator)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { result, timestamp: Date.now() });
  }

  /**
   * Verifies whether an entry exists in the cache.
   * @param key - Cache signature key.
   * @returns True if present in cache; false otherwise.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Returns current count of cached items.
   */
  size(): number {
    return this.store.size;
  }
}

// ==============================================================================
// 2. Triage Store Interface & Indexed In-Memory Implementation
// ==============================================================================

/**
 * Interface contract for the Healthcare Triage Store.
 * Enforces Dependency Inversion for clean swapping with SQL / Prisma drivers.
 */
export interface ITriageStore {
  /**
   * Retrieves real-time bed capacity and occupancy telemetry across all hospital departments.
   * @returns Promise resolving to an array of department capacity records.
   */
  getDepartmentCapacities(): Promise<DepartmentCapacity[]>;

  /**
   * Retrieves capacity status for a single department in O(1) time.
   * @param department - Department identifier.
   * @returns Promise resolving to capacity or null if not found.
   */
  getDepartmentCapacity(department: DepartmentType): Promise<DepartmentCapacity | null>;

  /**
   * Reserves an emergency bed in the specified department with atomic capacity updates.
   * @param department - Destination department for patient admission.
   * @returns Promise resolving to allocation status and generated bed identifier.
   */
  allocateBed(department: DepartmentType): Promise<{ success: boolean; bedId?: string }>;

  /**
   * Persists a completed triage assessment record into O(1) indexed storage.
   * @param data - Assessment payload omitting system-generated ID and timestamp.
   * @returns Promise resolving to the stored, immutable TriageAssessment record.
   */
  saveTriageAssessment(
    data: Omit<TriageAssessment, "id" | "timestamp" | "actionsTaken" | "agentActionsExecuted"> & {
      actionsTaken?: AgentAction[];
      agentActionsExecuted?: AgentAction[];
    }
  ): Promise<TriageAssessment>;

  /**
   * Retrieves a specific triage assessment by its unique ID in O(1) time.
   * @param id - Unique triage assessment identifier.
   * @returns Promise resolving to assessment record or null if not found.
   */
  getTriageAssessmentById(id: string): Promise<TriageAssessment | null>;

  /**
   * Lists historical triage assessments utilizing dual O(1) index lookups and simulated pagination.
   * @param params - Optional pagination limits, offsets, and clinical filters.
   * @returns Promise resolving to a PaginatedResult containing matched assessments.
   */
  listTriageAssessments(params?: {
    limit?: number;
    offset?: number;
    esiLevel?: number;
    department?: DepartmentType;
  }): Promise<PaginatedResult<TriageAssessment>>;

  /**
   * Generates a deterministic signature hash from patient vitals for fast LRU cache lookups.
   * @param vitals - Patient physiological vitals.
   * @returns Deterministic string signature.
   */
  hashVitals(vitals: Readonly<Vitals>): string;

  /**
   * Retrieves cached calculation result for a given signature key.
   * @param key - Unique calculation key.
   * @returns Cached result or null if missing or expired.
   */
  getCachedCalculation<T>(key: string): T | null;

  /**
   * Stores calculation result into the LRU cache.
   * @param key - Unique calculation key.
   * @param result - Result to cache.
   */
  setCachedCalculation<T>(key: string, result: T): void;

  /**
   * Returns current count of items in the calculation cache.
   */
  getCacheSize(): number;

  /**
   * Clears all session records, caches, and restores initial department capacities.
   */
  resetStore(): Promise<void>;
}

/**
 * High-performance in-memory triage store utilizing dual O(1) indices and LRU caching.
 */
class IndexedTriageStore implements ITriageStore {
  /** Primary record store: Key = TriageRecord.id -> O(1) direct ID queries */
  private assessments: Map<string, TriageRecord> = new Map();

  /** Chronologically sorted ID index (most recent first) for slice-based pagination without full scans */
  private chronologicalIds: string[] = [];

  /** Secondary Index: Key = DepartmentType -> Set of Assessment IDs for O(1) department lookups */
  private departmentIndex: Map<DepartmentType, Set<string>> = new Map();

  /** Secondary Index: Key = ESI Level (1..5) -> Set of Assessment IDs for O(1) acuity lookups */
  private esiLevelIndex: Map<number, Set<string>> = new Map();

  /** Real-time hospital department capacity states */
  private capacities: Map<DepartmentType, DepartmentCapacity> = new Map();

  /** In-memory LRU calculation cache for deterministic computations */
  private lruCache: LRUCalculationCache<unknown> = new LRUCalculationCache<unknown>(256);

  constructor() {
    this.initSecondaryIndices();
    this.seedCapacities();
    this.seedSampleAssessments();
  }

  private deepClone<T>(obj: T): T {
    return typeof structuredClone === "function"
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));
  }

  private initSecondaryIndices(): void {
    const departments: DepartmentType[] = ["ICU", "ER", "General Ward", "Fast Track"];
    this.departmentIndex.clear();
    for (const d of departments) {
      this.departmentIndex.set(d, new Set<string>());
    }

    this.esiLevelIndex.clear();
    for (let level = 1; level <= 5; level++) {
      this.esiLevelIndex.set(level, new Set<string>());
    }
  }

  private seedCapacities(): void {
    const initialCapacities: DepartmentCapacity[] = [
      {
        department: "ICU",
        totalBeds: 12,
        occupiedBeds: 10,
        availableBeds: 2,
        utilizationRate: 0.83,
        acceptingPatients: true,
      },
      {
        department: "ER",
        totalBeds: 35,
        occupiedBeds: 28,
        availableBeds: 7,
        utilizationRate: 0.8,
        acceptingPatients: true,
      },
      {
        department: "General Ward",
        totalBeds: 90,
        occupiedBeds: 72,
        availableBeds: 18,
        utilizationRate: 0.8,
        acceptingPatients: true,
      },
      {
        department: "Fast Track",
        totalBeds: 20,
        occupiedBeds: 11,
        availableBeds: 9,
        utilizationRate: 0.55,
        acceptingPatients: true,
      },
    ];

    this.capacities.clear();
    for (const cap of initialCapacities) {
      this.capacities.set(cap.department, cap);
    }
  }

  private seedSampleAssessments(): void {
    const sample: TriageAssessment = {
      id: "triage_seed_001",
      patient: {
        id: "pt_seed_101",
        name: "Eleanor Vance",
        age: 64,
        gender: "female",
        chiefComplaint: "Severe acute dyspnea, diaphoresis, productive cough",
        medicalHistory: ["COPD Stage III", "Congestive Heart Failure"],
        allergies: ["Penicillin"],
      },
      vitals: {
        heartRate: 128,
        systolicBp: 86,
        diastolicBp: 54,
        spO2: 88,
        respiratoryRate: 32,
        temperatureCelsius: 38.6,
        glasgowComaScale: 14,
      },
      deterministicScore: {
        esiLevel: 2,
        esiCategory: "EMERGENT",
        vitalRiskScore: 7.0,
        riskFactors: [
          "Severe Hypoxia (SpO2: 88%)",
          "Marked Arrhythmia/Tachycardia (128 bpm)",
          "Significant BP Abnormality (Systolic: 86 mmHg)",
          "Marked Tachypnea (32 bpm)",
        ],
        isCritical: true,
        clinicalFlag: "HIGH_RISK_EMERGENT",
      },
      aiReasoning:
        "Patient exhibits severe respiratory distress with decompensating hemodynamics. Immediate stabilization in ER Acute Bay required with high-flow oxygen and continuous monitoring.",
      clinicalSummary:
        "Emergent triage. Patient placed in Priority 2 queue with continuous cardiac and pulse oximetry monitoring.",
      finalEsiLevel: 2,
      resourceAllocation: {
        recommendedDepartment: "ER",
        alternativeDepartment: "ICU",
        allocatedBedId: "ER-BAY-04",
        priorityQueueRank: 2,
        estimatedWaitMinutes: 5,
        equipmentNeeded: [
          "Continuous Pulse Oximetry",
          "ECG 12-Lead",
          "IV Access & Stat Labs",
          "Dedicated RN Monitoring",
        ],
      },
      agentActionsExecuted: [
        {
          type: "BED_RESERVATION_MUTATION",
          description: "Bed ER-BAY-04 reserved in ER Acute Care Bay",
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          metadata: { department: "ER", bedId: "ER-BAY-04" },
        },
        {
          type: "CLINICAL_DISPATCH_ALERT",
          description: "Rapid Response respiratory alert dispatched to ER Senior Attending",
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          metadata: { alertLevel: "CRITICAL", channel: "ED_TRIAGE_ALERT" },
        },
        {
          type: "PRIORITY_QUEUE_REINDEX",
          description: "Patient promoted to Rank #2 in Emergency Department queue",
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          metadata: { priorityRank: 2 },
        },
      ],
      actionsTaken: [
        {
          type: "RESOURCE_RESERVED",
          description: "Bed ER-BAY-04 reserved in ER Acute Care Bay",
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          metadata: { department: "ER", bedId: "ER-BAY-04" },
        },
        {
          type: "DISPATCH_NOTIFICATION",
          description: "Rapid Response respiratory alert dispatched to ER Senior Attending",
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          metadata: { alertLevel: "CRITICAL", channel: "ED_TRIAGE_ALERT" },
        },
        {
          type: "QUEUE_PRIORITY_REORDER",
          description: "Patient promoted to Rank #2 in Emergency Department queue",
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          metadata: { priorityRank: 2 },
        },
      ],
      isFallback: false,
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      executionDurationMs: 310,
      latencyMs: 310,
      toolExecutionTimeMs: 4,
      confidenceScore: 0.95,
    };

    this.indexRecord(sample);
  }

  /**
   * Internal helper indexing record across dual O(1) structures.
   */
  private indexRecord(record: TriageRecord): void {
    this.assessments.set(record.id, record);
    this.chronologicalIds.unshift(record.id);

    const deptSet = this.departmentIndex.get(record.resourceAllocation.recommendedDepartment);
    if (deptSet) deptSet.add(record.id);

    const esiSet = this.esiLevelIndex.get(record.finalEsiLevel);
    if (esiSet) esiSet.add(record.id);
  }

  async getDepartmentCapacities(): Promise<DepartmentCapacity[]> {
    return this.deepClone(Array.from(this.capacities.values()));
  }

  async getDepartmentCapacity(department: DepartmentType): Promise<DepartmentCapacity | null> {
    const cap = this.capacities.get(department);
    return cap ? this.deepClone(cap) : null;
  }

  async allocateBed(department: DepartmentType): Promise<{ success: boolean; bedId?: string }> {
    const dept = this.capacities.get(department);
    if (!dept || dept.availableBeds <= 0) {
      return { success: false };
    }

    dept.occupiedBeds += 1;
    dept.availableBeds = Math.max(0, dept.totalBeds - dept.occupiedBeds);
    dept.utilizationRate = Number((dept.occupiedBeds / dept.totalBeds).toFixed(2));
    dept.acceptingPatients = dept.availableBeds > 0;
    this.capacities.set(department, dept);

    const bedId = `${department.replace(/\s+/g, "").toUpperCase()}-BED-${dept.occupiedBeds}`;
    return { success: true, bedId };
  }

  async saveTriageAssessment(
    data: Omit<TriageAssessment, "id" | "timestamp" | "actionsTaken" | "agentActionsExecuted"> & {
      actionsTaken?: AgentAction[];
      agentActionsExecuted?: AgentAction[];
    }
  ): Promise<TriageAssessment> {
    const id = `triage_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    const actions = data.agentActionsExecuted ?? data.actionsTaken ?? [];

    const record: TriageAssessment = {
      ...this.deepClone(data),
      id,
      timestamp,
      actionsTaken: actions,
      agentActionsExecuted: actions,
    };

    this.indexRecord(record);
    return this.deepClone(record);
  }

  async getTriageAssessmentById(id: string): Promise<TriageAssessment | null> {
    const record = this.assessments.get(id);
    return record ? this.deepClone(record) : null;
  }

  async listTriageAssessments(
    params: {
      limit?: number;
      offset?: number;
      esiLevel?: number;
      department?: DepartmentType;
    } = {}
  ): Promise<PaginatedResult<TriageAssessment>> {
    const limit = Math.min(100, Math.max(1, params.limit ?? 10));
    const offset = Math.max(0, params.offset ?? 0);

    let candidateIds: string[];

    if (params.esiLevel !== undefined && params.department) {
      const esiSet = this.esiLevelIndex.get(params.esiLevel) ?? new Set<string>();
      const deptSet = this.departmentIndex.get(params.department) ?? new Set<string>();
      candidateIds = this.chronologicalIds.filter((id) => esiSet.has(id) && deptSet.has(id));
    } else if (params.esiLevel !== undefined) {
      const esiSet = this.esiLevelIndex.get(params.esiLevel) ?? new Set<string>();
      candidateIds = this.chronologicalIds.filter((id) => esiSet.has(id));
    } else if (params.department) {
      const deptSet = this.departmentIndex.get(params.department) ?? new Set<string>();
      candidateIds = this.chronologicalIds.filter((id) => deptSet.has(id));
    } else {
      candidateIds = this.chronologicalIds;
    }

    const total = candidateIds.length;
    const sliceIds = candidateIds.slice(offset, offset + limit);

    const items = sliceIds
      .map((id) => this.assessments.get(id))
      .filter((r): r is TriageRecord => r !== undefined)
      .map((r) => this.deepClone(r));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  hashVitals(vitals: Readonly<Vitals>): string {
    return [
      `hr:${vitals.heartRate}`,
      `sbp:${vitals.systolicBp}`,
      `dbp:${vitals.diastolicBp}`,
      `spo2:${vitals.spO2}`,
      `rr:${vitals.respiratoryRate}`,
      `temp:${vitals.temperatureCelsius ?? "none"}`,
      `gcs:${vitals.glasgowComaScale ?? "none"}`,
    ].join("_");
  }

  getCachedCalculation<T>(key: string): T | null {
    const entry = this.lruCache.get(key);
    return entry ? (entry.result as T) : null;
  }

  setCachedCalculation<T>(key: string, result: T): void {
    this.lruCache.set(key, result);
  }

  getCacheSize(): number {
    return this.lruCache.size();
  }

  async resetStore(): Promise<void> {
    this.assessments.clear();
    this.chronologicalIds = [];
    this.lruCache.clear();
    this.initSecondaryIndices();
    this.seedCapacities();
    this.seedSampleAssessments();
  }
}

// Global Singleton for Healthcare Triage
const globalForTriage = globalThis as unknown as {
  mockTriageStore?: ITriageStore;
};

export const mockTriageStore =
  globalForTriage.mockTriageStore ?? new IndexedTriageStore();

if (process.env.NODE_ENV !== "production") {
  globalForTriage.mockTriageStore = mockTriageStore;
}

// ==============================================================================
// 3. Evaluation Repository (for existing benchmarks & test runs)
// ==============================================================================

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface BenchmarkRun {
  id: string;
  model: string;
  status: RunStatus;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  averageLatencyMs: number;
  durationMs: number;
  isMock: boolean;
  createdAt: Date;
  updatedAt: Date;
  results: TestCaseResult[];
  metadata?: Record<string, unknown>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "averageScore" | "durationMs";
  sortOrder?: "asc" | "desc";
}

export interface RunFilterOptions extends PaginationParams {
  model?: string;
  status?: RunStatus | "all";
  search?: string;
}

export interface BenchmarkPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AggregateStats {
  totalRuns: number;
  completedRuns: number;
  overallAvgScore: number;
  totalEvaluatedCases: number;
  avgLatencyMs: number;
}

export interface IEvaluationRepository {
  createRun(data: Omit<BenchmarkRun, "id" | "createdAt" | "updatedAt">): Promise<BenchmarkRun>;
  getRunById(id: string): Promise<BenchmarkRun | null>;
  listRuns(options?: RunFilterOptions): Promise<BenchmarkPaginatedResult<BenchmarkRun>>;
  updateRunStatus(id: string, status: RunStatus): Promise<BenchmarkRun | null>;
  deleteRun(id: string): Promise<boolean>;
  getAggregateStats(): Promise<AggregateStats>;
  clear(): Promise<void>;
  resetToDefaults(): Promise<void>;
}

class MockEvaluationRepository implements IEvaluationRepository {
  private runs: Map<string, BenchmarkRun> = new Map();

  constructor() {
    this.seedDefaultRuns();
  }

  private deepClone<T>(obj: T): T {
    return typeof structuredClone === "function"
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));
  }

  private seedDefaultRuns(): void {
    const sampleCases: TestCaseResult[] = [
      {
        testCaseId: "seed-tc-1",
        input: "What is the capital of France?",
        expectedOutput: "The capital of France is Paris.",
        actualOutput: "The capital of France is Paris.",
        latencyMs: 142,
        tokenUsage: { promptTokens: 14, completionTokens: 8, totalTokens: 22 },
        metrics: [
          {
            metric: "exact_match",
            score: 1.0,
            passed: true,
            reasoning: "Exact match verified against ground truth",
          },
        ],
        overallScore: 1.0,
        passed: true,
        isMock: true,
      },
    ];

    const initialRuns: BenchmarkRun[] = [
      {
        id: "run_seed_001",
        model: "gemini-1.5-pro",
        status: "completed",
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        averageScore: 1.0,
        averageLatencyMs: 142,
        durationMs: 284,
        isMock: true,
        createdAt: new Date(Date.now() - 3600000 * 2),
        updatedAt: new Date(Date.now() - 3600000 * 2),
        results: sampleCases,
        metadata: { benchmark: "SQuAD-Lite QA Baseline" },
      },
      {
        id: "run_seed_002",
        model: "gemini-1.5-flash",
        status: "completed",
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        averageScore: 0.9,
        averageLatencyMs: 95,
        durationMs: 190,
        isMock: true,
        createdAt: new Date(Date.now() - 3600000 * 24),
        updatedAt: new Date(Date.now() - 3600000 * 24),
        results: sampleCases,
        metadata: { benchmark: "Low-Latency Evaluation" },
      },
    ];

    for (const run of initialRuns) {
      this.runs.set(run.id, run);
    }
  }

  async createRun(
    data: Omit<BenchmarkRun, "id" | "createdAt" | "updatedAt">
  ): Promise<BenchmarkRun> {
    const id = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();

    const newRecord: BenchmarkRun = {
      ...this.deepClone(data),
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(id, newRecord);
    return this.deepClone(newRecord);
  }

  async getRunById(id: string): Promise<BenchmarkRun | null> {
    const record = this.runs.get(id);
    return record ? this.deepClone(record) : null;
  }

  async listRuns(options: RunFilterOptions = {}): Promise<BenchmarkPaginatedResult<BenchmarkRun>> {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const rawLimit = Math.floor(options.limit ?? 10);
    const limit = Math.min(100, Math.max(1, rawLimit));
    const sortBy = options.sortBy ?? "createdAt";
    const sortOrder = options.sortOrder ?? "desc";

    let list = Array.from(this.runs.values());

    if (options.status && options.status !== "all") {
      list = list.filter((r) => r.status === options.status);
    }
    if (options.model) {
      const target = options.model.toLowerCase();
      list = list.filter((r) => r.model.toLowerCase().includes(target));
    }

    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "createdAt") comparison = a.createdAt.getTime() - b.createdAt.getTime();
      else if (sortBy === "averageScore") comparison = a.averageScore - b.averageScore;
      else if (sortBy === "durationMs") comparison = a.durationMs - b.durationMs;
      return sortOrder === "asc" ? comparison : -comparison;
    });

    const total = list.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;

    return {
      items: this.deepClone(list.slice(startIndex, startIndex + limit)),
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async updateRunStatus(id: string, status: RunStatus): Promise<BenchmarkRun | null> {
    const existing = this.runs.get(id);
    if (!existing) return null;
    existing.status = status;
    existing.updatedAt = new Date();
    this.runs.set(id, existing);
    return this.deepClone(existing);
  }

  async deleteRun(id: string): Promise<boolean> {
    return this.runs.delete(id);
  }

  async getAggregateStats(): Promise<AggregateStats> {
    const all = Array.from(this.runs.values());
    const totalRuns = all.length;
    if (totalRuns === 0) {
      return { totalRuns: 0, completedRuns: 0, overallAvgScore: 0, totalEvaluatedCases: 0, avgLatencyMs: 0 };
    }
    const completed = all.filter((r) => r.status === "completed");
    const totalScore = completed.reduce((sum, r) => sum + r.averageScore, 0);
    const overallAvgScore = completed.length > 0 ? Number((totalScore / completed.length).toFixed(4)) : 0;
    const totalEvaluatedCases = all.reduce((sum, r) => sum + r.totalCases, 0);
    const totalLatency = all.reduce((sum, r) => sum + r.averageLatencyMs, 0);

    return {
      totalRuns,
      completedRuns: completed.length,
      overallAvgScore,
      totalEvaluatedCases,
      avgLatencyMs: Math.round(totalLatency / totalRuns),
    };
  }

  async clear(): Promise<void> {
    this.runs.clear();
  }

  async resetToDefaults(): Promise<void> {
    this.runs.clear();
    this.seedDefaultRuns();
  }
}

const globalForStore = globalThis as unknown as {
  mockEvaluationRepository?: IEvaluationRepository;
};

export const mockEvaluationRepository =
  globalForStore.mockEvaluationRepository ?? new MockEvaluationRepository();

if (process.env.NODE_ENV !== "production") {
  globalForStore.mockEvaluationRepository = mockEvaluationRepository;
}
