import * as z from "zod";

export const CALENDAR_VIEWS = ["items", "orders"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const calendarSearchSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1900).max(9999).optional(),
});

export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

export const calendarQuerySchema = z.object({
  view: z.enum(CALENDAR_VIEWS),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(9999),
});

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
