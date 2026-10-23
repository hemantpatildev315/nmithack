import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";
import { handleApiError, apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

describe("Health API & Global Response Sanitizer", () => {
  it("should return a 200 OK healthy status response with valid metadata", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe("healthy");
    expect(body.data.service).toBe("ai-evaluation-engine");
    expect(body.timestamp).toBeTypeOf("string");
    expect(body.meta?.version).toBe("1.0.0");
  });

  it("should sanitize generic errors without leaking internal stack traces", async () => {
    const errorWithSecret = new Error("Database connection to postgres://admin:secret@db.internal:5432 failed");
    errorWithSecret.stack = "Error: at SensitiveInternalFile.ts:42:15\n    at eval (secret-logic.ts:10:5)";

    const response = handleApiError(errorWithSecret, "Sanitized generic error");
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    // Ensure no stack trace property is ever returned to client
    expect(body.error).not.toHaveProperty("stack");
    expect(JSON.stringify(body)).not.toContain("SensitiveInternalFile.ts");
  });

  it("should format Zod validation errors into structured 422 responses", async () => {
    const testSchema = z.object({
      metric: z.enum(["accuracy", "latency"]),
      score: z.number().min(0).max(1),
    });

    const invalidInput = { metric: "unsupported_metric", score: 5.5 };
    const parseResult = testSchema.safeParse(invalidInput);

    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const response = handleApiError(parseResult.error);
      expect(response.status).toBe(422);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details.length).toBe(2);
    }
  });

  it("should generate standardized apiSuccess and apiError payloads", async () => {
    const successRes = apiSuccess({ count: 42 });
    const successBody = await successRes.json();
    expect(successBody.success).toBe(true);
    expect(successBody.data.count).toBe(42);

    const errorRes = apiError("Invalid configuration", 400, "CONFIG_ERROR");
    const errorBody = await errorRes.json();
    expect(errorBody.success).toBe(false);
    expect(errorBody.error.code).toBe("CONFIG_ERROR");
    expect(errorBody.error.message).toBe("Invalid configuration");
  });
});
