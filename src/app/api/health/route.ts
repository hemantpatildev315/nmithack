import { apiSuccess, handleApiError } from "@/lib/api-response";
import { isMockGemini, env } from "@/lib/env";

export async function GET() {
  try {
    const healthData = {
      status: "healthy",
      service: "ai-evaluation-engine",
      environment: env.NODE_ENV,
      geminiMode: isMockGemini ? "mock-fallback" : "live-api",
      configuredModel: env.GEMINI_MODEL,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };

    return apiSuccess(healthData, 200, {
      version: "1.0.0",
    });
  } catch (error) {
    return handleApiError(error, "Failed to retrieve health status");
  }
}
