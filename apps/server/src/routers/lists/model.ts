import * as z from "zod";
import { LIST_PAGE_SIZE, listIdsSchema, listTargetsSchema } from "@myakiba/contracts/lists/schema";
import {
  paginationLimitSchema,
  paginationOffsetSchema,
} from "@myakiba/contracts/shared/pagination";

export const listIdParamSchema = z.object({ listId: z.string().trim().min(1) });

export const listPageQuerySchema = z.object({
  limit: paginationLimitSchema.optional().default(LIST_PAGE_SIZE),
  offset: paginationOffsetSchema.optional().default(0),
});

export const listOptionsForTargetsSchema = z.object({ targets: listTargetsSchema });

export const addTargetsToListsSchema = z.object({
  targets: listTargetsSchema,
  listIds: listIdsSchema,
});

export const removeTargetsFromListSchema = listIdParamSchema.extend({
  targets: listTargetsSchema,
});

export const removeListMembersSchema = z.object({
  memberIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .refine((memberIds) => new Set(memberIds).size === memberIds.length, {
      error: "Selected IDs must be unique",
    }),
});

export const deleteListsSchema = z.object({ listIds: listIdsSchema });
