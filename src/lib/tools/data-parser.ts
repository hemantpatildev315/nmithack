/**
 * Deterministic Data Parser Tools for Agent & Evaluation Workflows
 */

/**
 * Extracts raw contents from fenced markdown code blocks.
 * Supports triple backticks with optional language tags (e.g. ```json ... ```)
 */
export function extractMarkdownCodeBlocks(
  text: string,
  targetLanguage?: string
): string[] {
  if (!text) return [];

  const pattern = /```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const lang = match[1]?.trim().toLowerCase();
    const content = match[2]?.trim() ?? "";

    if (!targetLanguage || lang === targetLanguage.toLowerCase()) {
      blocks.push(content);
    }
  }

  return blocks;
}

/**
 * Normalizes text for deterministic NLP and evaluation comparison.
 * Trims, converts to lowercase, normalizes whitespace, and strips standard punctuation.
 */
export function normalizeText(text: string): string {
  if (!text) return "";

  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Safely parses JSON strings, with automatic recovery for markdown wrappers
 * and partial text blocks commonly returned by LLM outputs.
 */
export function parseJsonSafely<T = unknown>(
  input: string,
  fallback: T | null = null
): { success: boolean; data: T | null; error?: string } {
  if (!input || typeof input !== "string") {
    return { success: false, data: fallback, error: "Input must be a non-empty string" };
  }

  const trimmed = input.trim();

  // 1. Direct parse attempt
  try {
    const parsed = JSON.parse(trimmed) as T;
    return { success: true, data: parsed };
  } catch {
    // Continue to fallback extractors
  }

  // 2. Extract from markdown code blocks if wrapped
  const codeBlocks = extractMarkdownCodeBlocks(trimmed, "json");
  for (const block of codeBlocks) {
    try {
      const parsed = JSON.parse(block) as T;
      return { success: true, data: parsed };
    } catch {
      // Continue searching
    }
  }

  // 3. Heuristic JSON object/array bounding detection
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const substring = trimmed.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(substring) as T;
      return { success: true, data: parsed };
    } catch {
      // Ignore
    }
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      const substring = trimmed.slice(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(substring) as T;
      return { success: true, data: parsed };
    } catch {
      // Ignore
    }
  }

  return {
    success: false,
    data: fallback,
    error: "Failed to extract valid JSON from input",
  };
}

/**
 * Parses numeric score pairs from evaluator reasoning text (e.g. "Score: 0.85" or "accuracy: 90%").
 */
export function extractScoreMetrics(text: string): Record<string, number> {
  const scores: Record<string, number> = {};
  if (!text) return scores;

  const scoreRegex = /([a-zA-Z_]+)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?%?)/gi;
  let match: RegExpExecArray | null;

  while ((match = scoreRegex.exec(text)) !== null) {
    const key = match[1]?.toLowerCase().trim();
    const rawVal = match[2]?.trim();

    if (key && rawVal) {
      if (rawVal.endsWith("%")) {
        const val = parseFloat(rawVal.slice(0, -1)) / 100;
        if (!isNaN(val)) scores[key] = Math.min(Math.max(val, 0), 1);
      } else {
        const val = parseFloat(rawVal);
        if (!isNaN(val)) scores[key] = val <= 1 ? val : val / 100;
      }
    }
  }

  return scores;
}
