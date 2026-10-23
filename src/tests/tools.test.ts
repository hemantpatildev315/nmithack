import { describe, it, expect } from "vitest";
import {
  extractMarkdownCodeBlocks,
  parseJsonSafely,
  normalizeText,
  extractScoreMetrics,
} from "@/lib/tools/data-parser";
import {
  calculateExactMatch,
  calculateTokenF1,
  calculateNgramOverlap,
  calculateWeightedRubricScore,
  calculatePercentile,
} from "@/lib/tools/calculation-engine";

describe("Deterministic Agent Tools: Data Parser", () => {
  it("should cleanly extract markdown code blocks by language", () => {
    const rawMarkdown = `
Here is the code solution:
\`\`\`python
def evaluate():
    return True
\`\`\`
And here is metadata:
\`\`\`json
{ "passed": true }
\`\`\`
`;
    const pythonBlocks = extractMarkdownCodeBlocks(rawMarkdown, "python");
    expect(pythonBlocks).toHaveLength(1);
    expect(pythonBlocks[0]).toContain("def evaluate():");

    const jsonBlocks = extractMarkdownCodeBlocks(rawMarkdown, "json");
    expect(jsonBlocks).toHaveLength(1);
    expect(jsonBlocks[0]).toContain('"passed": true');
  });

  it("should safely parse raw or wrapped JSON without throwing", () => {
    const directJson = '{"score": 0.95, "name": "benchmark"}';
    const parsedDirect = parseJsonSafely<{ score: number }>(directJson);
    expect(parsedDirect.success).toBe(true);
    expect(parsedDirect.data?.score).toBe(0.95);

    const conversationalWrapped = 'Analysis completed. Output is: {"status": "ok"} with high confidence.';
    const parsedWrapped = parseJsonSafely<{ status: string }>(conversationalWrapped);
    expect(parsedWrapped.success).toBe(true);
    expect(parsedWrapped.data?.status).toBe("ok");

    const invalid = "Not JSON at all";
    const parsedInvalid = parseJsonSafely(invalid, { fallback: true });
    expect(parsedInvalid.success).toBe(false);
    expect(parsedInvalid.data).toEqual({ fallback: true });
  });

  it("should normalize text for deterministic comparison", () => {
    const input = "  Hello, World! This is an AI EVALUATION!!  ";
    const normalized = normalizeText(input);
    expect(normalized).toBe("hello world this is an ai evaluation");
  });

  it("should extract score metrics from model reasoning text", () => {
    const reasoning = "Faithfulness: 0.92, Hallucination: 10%, Accuracy: 0.88";
    const extracted = extractScoreMetrics(reasoning);
    expect(extracted.faithfulness).toBe(0.92);
    expect(extracted.hallucination).toBe(0.1);
    expect(extracted.accuracy).toBe(0.88);
  });
});

describe("Deterministic Agent Tools: Calculation Engine", () => {
  it("should accurately compute exact match scores", () => {
    expect(calculateExactMatch("The capital is Paris.", "the capital is paris")).toBe(1.0);
    expect(calculateExactMatch("London is the capital", "Paris is the capital")).toBe(0.0);
    expect(calculateExactMatch("Hello ", "Hello", true)).toBe(0.0); // strict mismatch
  });

  it("should calculate SQuAD token-level Precision, Recall, and F1", () => {
    const pred = "the quick brown fox";
    const exp = "the brown fox jumps";

    const { precision, recall, f1 } = calculateTokenF1(pred, exp);
    // Common tokens: "the", "brown", "fox" = 3
    // pred len = 4 -> precision = 3/4 = 0.75
    // exp len = 4 -> recall = 3/4 = 0.75
    // f1 = 0.75
    expect(precision).toBe(0.75);
    expect(recall).toBe(0.75);
    expect(f1).toBe(0.75);
  });

  it("should calculate n-gram overlap", () => {
    const overlap = calculateNgramOverlap("artificial intelligence model", "artificial intelligence systems", 2);
    expect(overlap).toBeGreaterThan(0);
  });

  it("should compute weighted rubric composite score", () => {
    const rubric = [
      { score: 1.0, weight: 0.5 }, // 0.5
      { score: 0.8, weight: 0.5 }, // 0.4
    ];
    const score = calculateWeightedRubricScore(rubric);
    expect(score).toBe(0.9);
  });

  it("should accurately calculate latency percentiles", () => {
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(calculatePercentile(latencies, 50)).toBe(50);
    expect(calculatePercentile(latencies, 90)).toBe(90);
  });
});
