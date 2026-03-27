import * as z from "zod";

export const monthYearQuerySchema = z.object({
  month: z.coerce.number(),
  year: z.coerce.number(),
});
