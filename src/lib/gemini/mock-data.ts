/**
 * Safe Deterministic Fallback Mock Data and Generators for AI Evaluation
 */

export interface MockScenario {
  inputKeywords: string[];
  mockResponse: string;
  rationale: string;
  estimatedTokens: { prompt: number; completion: number };
}

export const MOCK_SCENARIOS: MockScenario[] = [
  {
    inputKeywords: ["paris", "france", "capital"],
    mockResponse: "The capital of France is Paris.",
    rationale: "Direct, factual answer aligned with ground truth.",
    estimatedTokens: { prompt: 14, completion: 8 },
  },
  {
    inputKeywords: ["python", "fibonacci", "function"],
    mockResponse:
      "```python\ndef fibonacci(n: int) -> int:\n    if n <= 0:\n        return 0\n    elif n == 1:\n        return 1\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n```",
    rationale: "Syntactically correct iterative Fibonacci implementation with O(n) time and O(1) space.",
    estimatedTokens: { prompt: 20, completion: 65 },
  },
  {
    inputKeywords: ["summarize", "context", "document"],
    mockResponse:
      "The document highlights that rigorous deterministic evaluations are crucial for LLM safety, reproducibility, and benchmark validity.",
    rationale: "Concise summary capturing the salient thesis of the provided context.",
    estimatedTokens: { prompt: 45, completion: 24 },
  },
  {
    inputKeywords: ["quantum", "computing", "qubit"],
    mockResponse:
      "Unlike classical bits which represent 0 or 1, qubits exploit superposition and entanglement to represent complex quantum states simultaneously.",
    rationale: "Accurate physical definition addressing core quantum principles.",
    estimatedTokens: { prompt: 18, completion: 26 },
  },
];

/**
 * Returns a deterministic fallback mock response for any arbitrary input prompt.
 */
export function getMockResponseForInput(input: string, context?: string): {
  text: string;
  promptTokens: number;
  completionTokens: number;
} {
  const normalized = (input + " " + (context ?? "")).toLowerCase();

  const matched = MOCK_SCENARIOS.find((scenario) =>
    scenario.inputKeywords.some((kw) => normalized.includes(kw))
  );

  if (matched) {
    return {
      text: matched.mockResponse,
      promptTokens: matched.estimatedTokens.prompt,
      completionTokens: matched.estimatedTokens.completion,
    };
  }

  // Generic deterministic fallback
  const wordCount = input.split(/\s+/).length;
  const promptTokens = Math.max(8, wordCount * 2);
  const completionTokens = 32;

  const text = context
    ? `Based on the provided context, the verified evaluation response to "${input.slice(0, 50).trim()}..." is systematically confirmed.`
    : `Deterministic evaluation output for: "${input.slice(0, 60).trim()}". All assertions successfully evaluated against reference criteria.`;

  return { text, promptTokens, completionTokens };
}
