import { TestCaseResult } from "@/lib/validators/eval.schema";

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

export interface PaginatedResult<T> {
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

/**
 * Repository interface contract demonstrating Clean Architecture & Dependency Inversion.
 * Can be swapped with a real Prisma / TiDB / MySQL implementation without breaking domain logic.
 */
export interface IEvaluationRepository {
  createRun(data: Omit<BenchmarkRun, "id" | "createdAt" | "updatedAt">): Promise<BenchmarkRun>;
  getRunById(id: string): Promise<BenchmarkRun | null>;
  listRuns(options?: RunFilterOptions): Promise<PaginatedResult<BenchmarkRun>>;
  updateRunStatus(id: string, status: RunStatus): Promise<BenchmarkRun | null>;
  deleteRun(id: string): Promise<boolean>;
  getAggregateStats(): Promise<AggregateStats>;
  clear(): Promise<void>;
  resetToDefaults(): Promise<void>;
}

/**
 * Production-grade in-memory mock repository.
 * - Thread-safe within Node's event loop.
 * - Enforces immutability via deep cloning so callers cannot mutate internal state.
 * - Simulates realistic asynchronous database operations with zero external network overhead.
 */
class MockEvaluationRepository implements IEvaluationRepository {
  private runs: Map<string, BenchmarkRun> = new Map();

  constructor() {
    this.seedDefaultRuns();
  }

  private deepClone<T>(obj: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
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
          {
            metric: "answer_relevance",
            score: 1.0,
            passed: true,
            reasoning: "Prompt intent satisfied with 100% relevance",
          },
        ],
        overallScore: 1.0,
        passed: true,
        isMock: true,
      },
      {
        testCaseId: "seed-tc-2",
        input: "Write a python function to compute the fibonacci sequence.",
        expectedOutput: "def fibonacci(n: int) -> int:",
        actualOutput: "```python\ndef fibonacci(n: int) -> int:\n    if n <= 1: return n\n    return fibonacci(n-1) + fibonacci(n-2)\n```",
        latencyMs: 380,
        tokenUsage: { promptTokens: 22, completionTokens: 48, totalTokens: 70 },
        metrics: [
          {
            metric: "f1_score",
            score: 0.88,
            passed: true,
            reasoning: "Token overlap high; valid syntax with standard recursion",
          },
          {
            metric: "latency",
            score: 0.81,
            passed: true,
            reasoning: "Completed in 380ms under 2000ms SLA",
          },
        ],
        overallScore: 0.85,
        passed: true,
        isMock: true,
      },
    ];

    const initialRuns: BenchmarkRun[] = [
      {
        id: "run_seed_001",
        model: "gemini-1.5-pro",
        status: "completed",
        totalCases: 2,
        passedCases: 2,
        failedCases: 0,
        averageScore: 0.925,
        averageLatencyMs: 261,
        durationMs: 522,
        isMock: true,
        createdAt: new Date(Date.now() - 3600000 * 2), // 2 hours ago
        updatedAt: new Date(Date.now() - 3600000 * 2),
        results: sampleCases,
        metadata: { benchmark: "SQuAD-Lite QA Baseline", concurrency: 2 },
      },
      {
        id: "run_seed_002",
        model: "gemini-1.5-flash",
        status: "completed",
        totalCases: 2,
        passedCases: 2,
        failedCases: 0,
        averageScore: 0.88,
        averageLatencyMs: 110,
        durationMs: 220,
        isMock: true,
        createdAt: new Date(Date.now() - 3600000 * 24), // 1 day ago
        updatedAt: new Date(Date.now() - 3600000 * 24),
        results: sampleCases,
        metadata: { benchmark: "Low-Latency Evaluation", concurrency: 5 },
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
    if (!record) return null;
    return this.deepClone(record);
  }

  async listRuns(options: RunFilterOptions = {}): Promise<PaginatedResult<BenchmarkRun>> {
    // 1. Enforce strict limits and boundary clamps (Security & Efficiency)
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const rawLimit = Math.floor(options.limit ?? 10);
    const limit = Math.min(100, Math.max(1, rawLimit)); // clamp between 1 and 100
    const sortBy = options.sortBy ?? "createdAt";
    const sortOrder = options.sortOrder ?? "desc";

    // 2. Filter records
    let list = Array.from(this.runs.values());

    if (options.status && options.status !== "all") {
      list = list.filter((r) => r.status === options.status);
    }

    if (options.model) {
      const target = options.model.toLowerCase();
      list = list.filter((r) => r.model.toLowerCase().includes(target));
    }

    if (options.search) {
      const q = options.search.toLowerCase();
      list = list.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q) ||
          (r.metadata?.benchmark && String(r.metadata.benchmark).toLowerCase().includes(q))
      );
    }

    // 3. Sort
    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "createdAt") {
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      } else if (sortBy === "averageScore") {
        comparison = a.averageScore - b.averageScore;
      } else if (sortBy === "durationMs") {
        comparison = a.durationMs - b.durationMs;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    // 4. Paginate
    const total = list.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = list.slice(startIndex, startIndex + limit);

    return {
      items: this.deepClone(paginatedItems),
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
      return {
        totalRuns: 0,
        completedRuns: 0,
        overallAvgScore: 0,
        totalEvaluatedCases: 0,
        avgLatencyMs: 0,
      };
    }

    const completed = all.filter((r) => r.status === "completed");
    const completedRuns = completed.length;
    const totalScore = completed.reduce((sum, r) => sum + r.averageScore, 0);
    const overallAvgScore = completedRuns > 0 ? Number((totalScore / completedRuns).toFixed(4)) : 0;
    const totalEvaluatedCases = all.reduce((sum, r) => sum + r.totalCases, 0);
    const totalLatency = all.reduce((sum, r) => sum + r.averageLatencyMs, 0);
    const avgLatencyMs = Math.round(totalLatency / totalRuns);

    return {
      totalRuns,
      completedRuns,
      overallAvgScore,
      totalEvaluatedCases,
      avgLatencyMs,
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

// Global Singleton Export (persists state across Next.js API requests during server lifetime)
const globalForStore = globalThis as unknown as {
  mockEvaluationRepository?: IEvaluationRepository;
};

export const mockEvaluationRepository =
  globalForStore.mockEvaluationRepository ?? new MockEvaluationRepository();

if (process.env.NODE_ENV !== "production") {
  globalForStore.mockEvaluationRepository = mockEvaluationRepository;
}
