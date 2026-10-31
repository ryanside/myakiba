import * as z from "zod";
import { isInternalPath } from "./auth-redirect-url";

const MAX_RETURN_PATH = 2048;

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
  /** The page an Add link was on. A target that would leave this site is dropped, not refused. */
  returnTo: z
    .union([
      z.string().max(MAX_RETURN_PATH).refine(isInternalPath),
      z.unknown().transform((): string | undefined => undefined),
    ])
    .optional(),
});

export type AddSearch = z.infer<typeof addSearchSchema>;
