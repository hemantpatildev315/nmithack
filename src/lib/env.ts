import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Google Gemini Configuration
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-pro"),

  // Hackathon Evaluation Engine Flags
  ENABLE_MOCK_GEMINI: z
    .enum(["true", "false"])
    .default("true")
    .transform((val) => val === "true"),
  EVAL_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  EVAL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),

  // Public Web App Configuration
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    const message = `❌ Invalid environment variables configuration:\n${errorDetails}`;

    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      // In development or test, log warning and use safe parsed defaults
      console.warn(message);
      return envSchema.parse({
        NODE_ENV: process.env.NODE_ENV ?? "development",
        ENABLE_MOCK_GEMINI: "true",
      });
    }
  }

  return result.data;
}

export const env = parseEnv();

/**
 * Helper to determine whether the app should operate with safe mock models.
 * Automatically true if no API key is supplied or mock mode is forced.
 */
export const isMockGemini = !env.GEMINI_API_KEY || env.ENABLE_MOCK_GEMINI;
