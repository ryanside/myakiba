import * as z from "zod";

export const CALENDAR_VIEWS = ["items", "orders"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const dayNumberSchema = z.coerce.number().int().min(1).max(31);

const dayNumberArraySchema = z
  .union([z.array(dayNumberSchema), dayNumberSchema])
  .transform((value) => {
    const list = Array.isArray(value) ? value : [value];
    const unique = [...new Set(list)];
    return unique.toSorted((a, b) => a - b);
  });

export const calendarSearchSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1900).max(9999).optional(),
  days: dayNumberArraySchema.optional(),
});

export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

export const calendarQuerySchema = z.object({
  view: z.enum(CALENDAR_VIEWS),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(9999),
});

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
