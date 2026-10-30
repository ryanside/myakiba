import * as z from "zod";

export const addSearchSchema = z.object({
  to: z
    .union([
      z.enum(["collection", "order-new", "wishlist", "none"]),
      z.string().regex(/^order:[a-z0-9]{8,64}$/),
    ])
    .optional(),
  item: z
    .string()
    .regex(/^[a-z0-9]{8,64}$/)
    .optional(),
  mfc: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  from: z.literal("mfc").optional(),
});

export type AddSearch = z.infer<typeof addSearchSchema>;
