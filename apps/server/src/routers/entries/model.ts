import * as z from "zod";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";

export const entryIdParamSchema = z.object({
  entryId: z.string().trim().min(1).max(WRITE_LIMITS.id),
});
