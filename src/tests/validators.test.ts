import { describe, it, expect } from "vitest";
import {
  EvaluationRequestSchema,
  MetricRubricSchema,
  EvaluationTestCaseSchema,
} from "@/lib/validators/eval.schema";

describe("Evaluation Zod Schemas Validation", () => {
  it("should validate a complete evaluation request payload", () => {
    const payload = {
      model: "gemini-1.5-pro",
      testCases: [
        {
          id: "tc-1",
          input: "Explain quantum superposition",
          expectedOutput: "A quantum system exists in multiple states simultaneously",
        },
      ],
      rubrics: [
        { metric: "exact_match", weight: 0.5, threshold: 0.8 },
        { metric: "faithfulness", weight: 0.5, threshold: 0.7 },
      ],
      temperature: 0.1,
      maxTokens: 512,
    };

    const parsed = EvaluationRequestSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it("should reject evaluation requests missing required test cases", () => {
    const payload = {
      testCases: [],
    };

    const parsed = EvaluationRequestSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("At least one evaluation test case is required");
    }
  });

  it("should enforce valid metric bounds in rubrics", () => {
    const invalidRubric = {
      metric: "f1_score",
      weight: 1.5, // Exceeds max 1.0
      threshold: -0.2, // Below min 0
    };

    const parsed = MetricRubricSchema.safeParse(invalidRubric);
    expect(parsed.success).toBe(false);
  });

  it("should validate test case schema", () => {
    const testCase = {
      id: "tc-001",
      input: "What is 2 + 2?",
      context: "Arithmetic context",
      expectedOutput: "4",
    };

    const parsed = EvaluationTestCaseSchema.safeParse(testCase);
    expect(parsed.success).toBe(true);
  });
});
