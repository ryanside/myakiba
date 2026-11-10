import * as z from "zod";

export const entriesWithRolesSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  roles: z.array(z.string()),
  sourceLabel: z.string().nullable(),
  materialPercentage: z.number().min(0).max(100).nullable(),
});

export const itemParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const itemIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export type EntriesWithRoles = z.infer<typeof entriesWithRolesSchema>;
