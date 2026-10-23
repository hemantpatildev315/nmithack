import { describe, it, expect } from "vitest";
import { generateEvaluationResponse } from "@/lib/gemini/client";
import { getMockResponseForInput } from "@/lib/gemini/mock-data";

describe("Google Gemini Client & Safe Fallback Mocks", () => {
  it("should return pre-calibrated mock responses when forceMock is enabled", async () => {
    const result = await generateEvaluationResponse("What is the capital of France?", undefined, {
      forceMock: true,
    });

    expect(result.isMock).toBe(true);
    expect(result.text).toContain("Paris");
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.tokenUsage.totalTokens).toBeGreaterThan(0);
    expect(result.model).toContain("mock");
  });

  it("should provide graceful generic mock generation for unknown evaluation prompts", async () => {
    const result = await generateEvaluationResponse("A completely novel prompt that has never been seen", undefined, {
      forceMock: true,
    });

    expect(result.isMock).toBe(true);
    expect(result.text.length).toBeGreaterThan(10);
    expect(result.tokenUsage.promptTokens).toBeGreaterThan(0);
    expect(result.tokenUsage.completionTokens).toBeGreaterThan(0);
  });

  it("should match domain keywords in mock-data generator", () => {
    const mock = getMockResponseForInput("Can you write a python function for fibonacci?");
    expect(mock.text).toContain("def fibonacci");
    expect(mock.promptTokens).toBe(20);
    expect(mock.completionTokens).toBe(65);
  });
});
