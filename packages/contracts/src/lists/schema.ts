import * as z from "zod";
import { WRITE_LIMITS } from "../shared/write-limits";

export const LIST_PAGE_SIZE = 25;
export const MAX_LIST_BATCH_SIZE = 500;

export const LIST_TARGET_TYPES = ["item", "collectionItem", "order"] as const;

export const listTargetTypeSchema = z.enum(LIST_TARGET_TYPES);
export const listTargetIdSchema = z.string().trim().min(1).max(WRITE_LIMITS.id);

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

/** A removed List Member as Undo sends it back: its target and the position it held. */
const listMemberRestoreSchema = z.strictObject({
  type: listTargetTypeSchema,
  id: listTargetIdSchema,
  position: z.int32().nonnegative(),
});

export const restoreListMembersSchema = z.strictObject({
  members: z
    .array(listMemberRestoreSchema)
    .min(1)
    .max(WRITE_LIMITS.ids)
    .refine(
      (members) =>
        new Set(members.map((member) => `${member.type}:${member.id}`)).size === members.length,
      { error: "List targets must be unique" },
    ),
});

export const listInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(WRITE_LIMITS.title),
  description: z.string().trim().max(WRITE_LIMITS.notes),
});

export const listIdsSchema = z
  .array(z.string().trim().min(1).max(WRITE_LIMITS.id))
  .min(1)
  .max(MAX_LIST_BATCH_SIZE)
  .refine((listIds) => new Set(listIds).size === listIds.length, {
    error: "List IDs must be unique",
  });

export type ListTarget = z.infer<typeof listTargetSchema>;
export type ListMemberRestore = z.infer<typeof listMemberRestoreSchema>;
export type ListInput = z.infer<typeof listInputSchema>;
