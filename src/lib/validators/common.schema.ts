import { z } from "zod";

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const IdParamSchema = z.object({
  id: z.string().min(1, "Identifier cannot be empty"),
});

export type IdParam = z.infer<typeof IdParamSchema>;

export const StatusFilterSchema = z.object({
  status: z.enum(["all", "pending", "running", "completed", "failed"]).default("all"),
});
