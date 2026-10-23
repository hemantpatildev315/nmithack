import { z } from "zod";

export const EvaluationMetricEnum = z.enum([
  "exact_match",
  "faithfulness",
  "answer_relevance",
  "hallucination",
  "latency",
  "f1_score",
]);

export type EvaluationMetric = z.infer<typeof EvaluationMetricEnum>;

export const MetricRubricSchema = z.object({
  metric: EvaluationMetricEnum,
  weight: z.number().min(0).max(1).default(1),
  threshold: z.number().min(0).max(1).default(0.7),
  description: z.string().optional(),
});

export type MetricRubric = z.infer<typeof MetricRubricSchema>;

export const EvaluationTestCaseSchema = z.object({
  id: z.string().min(1),
  input: z.string().min(1, "Input prompt or question is required"),
  context: z.string().optional(),
  expectedOutput: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type EvaluationTestCase = z.infer<typeof EvaluationTestCaseSchema>;

export const EvaluationRequestSchema = z.object({
  model: z.string().default("gemini-1.5-pro"),
  testCases: z.array(EvaluationTestCaseSchema).min(1, "At least one evaluation test case is required"),
  rubrics: z.array(MetricRubricSchema).default([
    { metric: "exact_match", weight: 0.3, threshold: 0.8 },
    { metric: "answer_relevance", weight: 0.4, threshold: 0.7 },
    { metric: "faithfulness", weight: 0.3, threshold: 0.7 },
  ]),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().min(1).max(8192).default(1024),
  forceMock: z.boolean().default(false),
});

export type EvaluationRequest = z.infer<typeof EvaluationRequestSchema>;

export const SingleMetricScoreSchema = z.object({
  metric: EvaluationMetricEnum,
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  reasoning: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type SingleMetricScore = z.infer<typeof SingleMetricScoreSchema>;

export const TestCaseResultSchema = z.object({
  testCaseId: z.string(),
  input: z.string(),
  expectedOutput: z.string().optional(),
  actualOutput: z.string(),
  latencyMs: z.number().nonnegative(),
  tokenUsage: z.object({
    promptTokens: z.number().nonnegative(),
    completionTokens: z.number().nonnegative(),
    totalTokens: z.number().nonnegative(),
  }),
  metrics: z.array(SingleMetricScoreSchema),
  overallScore: z.number().min(0).max(1),
  passed: z.boolean(),
  isMock: z.boolean(),
});

export type TestCaseResult = z.infer<typeof TestCaseResultSchema>;

export const EvaluationRunSummarySchema = z.object({
  runId: z.string(),
  model: z.string(),
  timestamp: z.string(),
  totalCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(1),
  averageLatencyMs: z.number().nonnegative(),
  results: z.array(TestCaseResultSchema),
});

export type EvaluationRunSummary = z.infer<typeof EvaluationRunSummarySchema>;
