import { NextResponse } from "next/server";
import { ZodError } from "zod";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = "APP_ERROR",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Creates a sanitized, standardized success NextResponse
 */
export function apiSuccess<T>(
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
  init?: ResponseInit
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      ...(meta ? { meta } : {}),
    },
    {
      status: statusCode,
      ...init,
    }
  );
}

/**
 * Creates a standardized error NextResponse
 */
export function apiError(
  message: string,
  statusCode = 400,
  code = "BAD_REQUEST",
  details?: unknown,
  init?: ResponseInit
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: statusCode,
      ...init,
    }
  );
}

/**
 * Global API error handler that captures exceptions and produces sanitized responses.
 * Guarantees NO internal stack traces or raw system internals are leaked in the client payload.
 */
export function handleApiError(
  error: unknown,
  fallbackMessage = "An unexpected server error occurred"
): NextResponse<ApiErrorResponse> {
  // Always log internal details securely on the server
  console.error("[API_ERROR]", error);

  // 1. Zod Validation Errors -> 422 Unprocessable Entity
  if (error instanceof ZodError) {
    const formattedErrors = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));

    return apiError(
      "Validation failed for the request payload",
      422,
      "VALIDATION_ERROR",
      formattedErrors
    );
  }

  // 2. Controlled Domain Application Errors
  if (error instanceof AppError) {
    return apiError(
      error.message,
      error.statusCode,
      error.code,
      error.details
    );
  }

  // 3. Known Standard Error instance (sanitized message, no stack trace)
  if (error instanceof Error) {
    // Only return the message if it's safe and in development, otherwise generic sanitized message
    const isDev = process.env.NODE_ENV === "development";
    const message = isDev ? error.message : fallbackMessage;

    return apiError(message, 500, "INTERNAL_SERVER_ERROR");
  }

  // 4. Unknown thrown primitives or objects
  return apiError(fallbackMessage, 500, "INTERNAL_SERVER_ERROR");
}
