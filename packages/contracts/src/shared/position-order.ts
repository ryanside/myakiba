import * as z from "zod";

export const MAX_POSITION_MOVE_SIZE = 500;

export const positionOrderInputSchema = z.object({
  movedIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_POSITION_MOVE_SIZE)
    .refine((movedIds) => new Set(movedIds).size === movedIds.length, {
      error: "Moved IDs must be unique",
    }),
  anchorId: z.string().trim().min(1).nullable(),
  placement: z.enum(["before", "after"]),
});

export type PositionOrderInput = z.infer<typeof positionOrderInputSchema>;
