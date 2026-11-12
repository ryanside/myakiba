import * as z from "zod";
import { isInternalPath } from "./auth-redirect-url";

const MAX_RETURN_PATH = 2048;

/** A preset in the wrong shape is dropped, so a stale or hand-made link still opens the page. */
const preset = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.unknown().transform((): z.output<T> | undefined => undefined)]).optional();

export const addSearchSchema = z.object({
  to: preset(
    z.union([
      z.enum(["collection", "order-new", "wishlist", "none"]),
      z.string().regex(/^order:[a-z0-9]{8,64}$/),
    ]),
  ),
  item: preset(z.string().regex(/^[a-z0-9]{8,64}$/)),
  mfc: preset(z.coerce.number().int().positive()),
  q: preset(z.string().trim().max(200)),
  from: preset(z.literal("mfc")),
  /** The page an Add link was on. A target that would leave this site is dropped. */
  returnTo: preset(z.string().max(MAX_RETURN_PATH).refine(isInternalPath)),
});

export type AddSearch = z.infer<typeof addSearchSchema>;
