/**
 * Deterministic Calculation Engine for Evaluation Metrics
 */
import { normalizeText } from "./data-parser";

/**
 * Calculates strict or normalized Exact Match (EM) between prediction and ground truth.
 */
export function calculateExactMatch(
  predicted: string,
  expected: string,
  strict = false
): number {
  if (strict) {
    return predicted === expected ? 1.0 : 0.0;
  }
  return normalizeText(predicted) === normalizeText(expected) ? 1.0 : 0.0;
}

/**
 * Calculates token-level Precision, Recall, and F1 score (standard SQuAD benchmark implementation).
 */
export function calculateTokenF1(
  predicted: string,
  expected: string
): { precision: number; recall: number; f1: number } {
  const predTokens = normalizeText(predicted).split(/\s+/).filter(Boolean);
  const expTokens = normalizeText(expected).split(/\s+/).filter(Boolean);

  if (predTokens.length === 0 && expTokens.length === 0) {
    return { precision: 1.0, recall: 1.0, f1: 1.0 };
  }
  if (predTokens.length === 0 || expTokens.length === 0) {
    return { precision: 0.0, recall: 0.0, f1: 0.0 };
  }

  // Count frequencies
  const expFreq = new Map<string, number>();
  for (const token of expTokens) {
    expFreq.set(token, (expFreq.get(token) ?? 0) + 1);
  }

  let commonCount = 0;
  const predFreq = new Map<string, number>();
  for (const token of predTokens) {
    predFreq.set(token, (predFreq.get(token) ?? 0) + 1);
  }

  for (const [token, count] of predFreq.entries()) {
    const expectedCount = expFreq.get(token) ?? 0;
    commonCount += Math.min(count, expectedCount);
  }

  if (commonCount === 0) {
    return { precision: 0.0, recall: 0.0, f1: 0.0 };
  }

  const precision = commonCount / predTokens.length;
  const recall = commonCount / expTokens.length;
  const f1 = (2 * precision * recall) / (precision + recall);

  return {
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
  };
}

/**
 * Calculates n-gram overlap between predicted text and expected reference.
 */
export function calculateNgramOverlap(
  predicted: string,
  expected: string,
  n = 2
): number {
  const pTokens = normalizeText(predicted).split(/\s+/).filter(Boolean);
  const eTokens = normalizeText(expected).split(/\s+/).filter(Boolean);

  if (pTokens.length < n || eTokens.length < n) {
    return calculateExactMatch(predicted, expected);
  }

  const getNgrams = (tokens: string[], size: number): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i <= tokens.length - size; i++) {
      set.add(tokens.slice(i, i + size).join(" "));
    }
    return set;
  };

  const pNgrams = getNgrams(pTokens, n);
  const eNgrams = getNgrams(eTokens, n);

  let overlap = 0;
  for (const gram of pNgrams) {
    if (eNgrams.has(gram)) overlap++;
  }

  return Number((overlap / pNgrams.size).toFixed(4));
}

/**
 * Computes normalized weighted rubric composite score.
 */
export function calculateWeightedRubricScore(
  items: Array<{ score: number; weight: number }>
): number {
  if (items.length === 0) return 0;

  const totalWeight = items.reduce((sum, item) => sum + Math.max(item.weight, 0), 0);
  if (totalWeight === 0) return 0;

  const weightedSum = items.reduce(
    (sum, item) => sum + Math.min(Math.max(item.score, 0), 1) * Math.max(item.weight, 0),
    0
  );

  return Number((weightedSum / totalWeight).toFixed(4));
}

/**
 * Calculates statistical percentile (e.g., 50 for median, 95 for p95 latency).
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  const clampedIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[clampedIndex] ?? 0;
}
