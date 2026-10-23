import { describe, it, expect, beforeEach } from "vitest";
import { mockEvaluationRepository, BenchmarkRun } from "@/lib/db/mockStore";

describe("In-Memory Mock Repository (mockStore.ts)", () => {
  beforeEach(async () => {
    await mockEvaluationRepository.resetToDefaults();
  });

  it("should initialize with pre-seeded benchmark runs", async () => {
    const paginated = await mockEvaluationRepository.listRuns();
    expect(paginated.total).toBeGreaterThanOrEqual(2);
    expect(paginated.items.length).toBeGreaterThanOrEqual(2);
    expect(paginated.page).toBe(1);
    expect(paginated.limit).toBe(10);
  });

  it("should create and retrieve a new benchmark run", async () => {
    const newRunData: Omit<BenchmarkRun, "id" | "createdAt" | "updatedAt"> = {
      model: "gemini-1.5-pro",
      status: "completed",
      totalCases: 5,
      passedCases: 4,
      failedCases: 1,
      averageScore: 0.885,
      averageLatencyMs: 195,
      durationMs: 980,
      isMock: true,
      results: [],
      metadata: { suite: "unit-test-run" },
    };

    const created = await mockEvaluationRepository.createRun(newRunData);
    expect(created.id).toMatch(/^run_\d+_/);
    expect(created.model).toBe("gemini-1.5-pro");
    expect(created.createdAt).toBeInstanceOf(Date);

    const fetched = await mockEvaluationRepository.getRunById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.averageScore).toBe(0.885);
  });

  it("should guarantee immutability by deep cloning state", async () => {
    const created = await mockEvaluationRepository.createRun({
      model: "test-model",
      status: "pending",
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      averageScore: 0.9,
      averageLatencyMs: 100,
      durationMs: 100,
      isMock: true,
      results: [],
    });

    // Mutate the returned object locally
    (created as Record<string, unknown>).model = "HACKED_MODEL";

    // Verify stored entity inside repository remains unmodified
    const fetched = await mockEvaluationRepository.getRunById(created.id);
    expect(fetched?.model).toBe("test-model");
  });

  it("should enforce pagination limits and clamp values strictly", async () => {
    // Attempt excessive limit (> 100)
    const paginatedOver = await mockEvaluationRepository.listRuns({ limit: 500, page: 1 });
    expect(paginatedOver.limit).toBe(100);

    // Attempt negative or zero page/limit
    const paginatedUnder = await mockEvaluationRepository.listRuns({ limit: -5, page: 0 });
    expect(paginatedUnder.limit).toBe(1);
    expect(paginatedUnder.page).toBe(1);
  });

  it("should filter runs by model and status", async () => {
    await mockEvaluationRepository.createRun({
      model: "custom-llama-3",
      status: "failed",
      totalCases: 2,
      passedCases: 0,
      failedCases: 2,
      averageScore: 0.2,
      averageLatencyMs: 500,
      durationMs: 1000,
      isMock: true,
      results: [],
    });

    const llamaRuns = await mockEvaluationRepository.listRuns({ model: "llama" });
    expect(llamaRuns.items.length).toBe(1);
    expect(llamaRuns.items[0]?.model).toBe("custom-llama-3");

    const failedRuns = await mockEvaluationRepository.listRuns({ status: "failed" });
    expect(failedRuns.items.length).toBe(1);
    expect(failedRuns.items[0]?.status).toBe("failed");
  });

  it("should sort runs by score and latency accurately", async () => {
    const byScoreDesc = await mockEvaluationRepository.listRuns({
      sortBy: "averageScore",
      sortOrder: "desc",
    });

    for (let i = 0; i < byScoreDesc.items.length - 1; i++) {
      expect(byScoreDesc.items[i]!.averageScore).toBeGreaterThanOrEqual(
        byScoreDesc.items[i + 1]!.averageScore
      );
    }
  });

  it("should update status and delete records cleanly", async () => {
    const created = await mockEvaluationRepository.createRun({
      model: "update-test",
      status: "pending",
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      averageScore: 0.8,
      averageLatencyMs: 150,
      durationMs: 150,
      isMock: true,
      results: [],
    });

    const updated = await mockEvaluationRepository.updateRunStatus(created.id, "completed");
    expect(updated?.status).toBe("completed");

    const deleted = await mockEvaluationRepository.deleteRun(created.id);
    expect(deleted).toBe(true);

    const checkGone = await mockEvaluationRepository.getRunById(created.id);
    expect(checkGone).toBeNull();
  });

  it("should calculate aggregate platform statistics accurately", async () => {
    const stats = await mockEvaluationRepository.getAggregateStats();
    expect(stats.totalRuns).toBeGreaterThanOrEqual(2);
    expect(stats.completedRuns).toBeGreaterThanOrEqual(2);
    expect(stats.overallAvgScore).toBeGreaterThan(0);
    expect(stats.avgLatencyMs).toBeGreaterThan(0);
    expect(stats.totalEvaluatedCases).toBeGreaterThan(0);
  });
});
