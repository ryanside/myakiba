import { app, getErrorMessage } from "@/lib/treaty-client";
import type { CalendarQuery } from "@myakiba/contracts/calendar/schema";

export type CalendarResponse = NonNullable<
  Awaited<ReturnType<typeof app.api.calendar.get>>["data"]
>;

export type CalendarItemsResponse = Extract<CalendarResponse, { view: "items" }>;
export type CalendarOrdersResponse = Extract<CalendarResponse, { view: "orders" }>;

export type CalendarItem = CalendarItemsResponse["items"][number];
export type CalendarOrder = CalendarOrdersResponse["orders"][number];

export async function getCalendar(query: CalendarQuery): Promise<CalendarResponse> {
  const { data, error } = await app.api.calendar.get({ query });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get calendar"));
  }
  return data;
}
