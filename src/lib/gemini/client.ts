import { env, isMockGemini } from "@/lib/env";
import { getMockResponseForInput } from "./mock-data";

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  forceMock?: boolean;
}

export interface ModelGenerationOutput {
  text: string;
  latencyMs: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isMock: boolean;
  model: string;
}

/**
 * Executes a Gemini model generation with automatic safe fallback mocks.
 * If the API key is absent, network fails, or mock mode is forced, it deterministically
 * provides valid benchmark payloads so evaluations never fail unexpectedly.
 */
export async function generateEvaluationResponse(
  input: string,
  context?: string,
  options: GenerationOptions = {}
): Promise<ModelGenerationOutput> {
  const startTime = performance.now();
  const shouldMock = options.forceMock || isMockGemini;

  // 1. Deterministic Safe Mock Fallback
  if (shouldMock || !env.GEMINI_API_KEY) {
    // Simulate brief deterministic latency (15-30ms)
    await new Promise((resolve) => setTimeout(resolve, 25));

    const mock = getMockResponseForInput(input, context);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      text: mock.text,
      latencyMs,
      tokenUsage: {
        promptTokens: mock.promptTokens,
        completionTokens: mock.completionTokens,
        totalTokens: mock.promptTokens + mock.completionTokens,
      },
      isMock: true,
      model: `${env.GEMINI_MODEL}-mock`,
    };
  }

  // 2. Real Google Gemini API Call with Graceful Degradation Fallback
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 1024,
      },
    });

    const contents = context
      ? `Context:\n${context}\n\nTask/Question:\n${input}`
      : input;

    const result = await model.generateContent(contents);
    const response = await result.response;
    const text = response.text() ?? "";

    const latencyMs = Math.round(performance.now() - startTime);
    const promptTokens = response.usageMetadata?.promptTokenCount ?? Math.max(10, Math.round(input.length / 4));
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? Math.max(10, Math.round(text.length / 4));

    return {
      text,
      latencyMs,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      isMock: false,
      model: env.GEMINI_MODEL,
    };
  } catch (error) {
    console.warn(
      "[Gemini Client] API call failed or timed out. Gracefully activating safe fallback mock:",
      error instanceof Error ? error.message : error
    );

    const mock = getMockResponseForInput(input, context);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      text: mock.text,
      latencyMs,
      tokenUsage: {
        promptTokens: mock.promptTokens,
        completionTokens: mock.completionTokens,
        totalTokens: mock.promptTokens + mock.completionTokens,
      },
      isMock: true,
      model: `${env.GEMINI_MODEL}-fallback`,
    };
  }
}
