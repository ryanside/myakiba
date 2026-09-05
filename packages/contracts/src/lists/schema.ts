import * as z from "zod";

export const LIST_PAGE_SIZE = 25;
export const MAX_LIST_BATCH_SIZE = 500;

export const LIST_TARGET_TYPES = ["item", "collectionItem", "order"] as const;

export const listTargetTypeSchema = z.enum(LIST_TARGET_TYPES);
export const listTargetIdSchema = z.string().trim().min(1);

export const listTargetSchema = z.object({
  type: listTargetTypeSchema,
  id: listTargetIdSchema,
});

export const listTargetsSchema = z
  .array(listTargetSchema)
  .min(1)
  .max(MAX_LIST_BATCH_SIZE)
  .refine(
    (targets) =>
      new Set(targets.map((target) => `${target.type}:${target.id}`)).size === targets.length,
    { error: "List targets must be unique" },
  );

export const listInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim(),
});

export const listIdsSchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(MAX_LIST_BATCH_SIZE)
  .refine((listIds) => new Set(listIds).size === listIds.length, {
    error: "List IDs must be unique",
  });

export type ListTarget = z.infer<typeof listTargetSchema>;
export type ListInput = z.infer<typeof listInputSchema>;
