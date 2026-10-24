import type { Result } from "better-result";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
import { app } from "@/lib/treaty-client";
import type { CalendarQuery } from "@myakiba/contracts/calendar/schema";

export type CalendarResponse = NonNullable<
  Awaited<ReturnType<typeof app.api.calendar.get>>["data"]
>;

export type CalendarItemsResponse = Extract<CalendarResponse, { view: "items" }>;
export type CalendarOrdersResponse = Extract<CalendarResponse, { view: "orders" }>;

export type CalendarItem = CalendarItemsResponse["items"][number];
export type CalendarOrder = CalendarOrdersResponse["orders"][number];

export function getCalendar(query: CalendarQuery): Promise<Result<CalendarResponse, ApiFailure>> {
  return call(app.api.calendar.get({ query }), { fallback: "Failed to get calendar" });
}
