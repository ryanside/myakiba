import { readResponse } from "@/lib/read-response";
import { app } from "@/lib/treaty-client";
import type { CalendarQuery } from "@myakiba/contracts/calendar/schema";

export type CalendarResponse = NonNullable<
  Awaited<ReturnType<typeof app.api.calendar.get>>["data"]
>;

export type CalendarItemsResponse = Extract<CalendarResponse, { view: "items" }>;
export type CalendarOrdersResponse = Extract<CalendarResponse, { view: "orders" }>;

export type CalendarItem = CalendarItemsResponse["items"][number];
export type CalendarOrder = CalendarOrdersResponse["orders"][number];

export async function getCalendar(query: CalendarQuery): Promise<CalendarResponse> {
  return readResponse(app.api.calendar.get({ query }), "Failed to get calendar");
}
