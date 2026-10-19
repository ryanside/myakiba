import type { CalendarQuery } from "@myakiba/contracts/calendar/schema";
import { getCalendar } from "@/queries/calendar";
import { getReleaseCalendar } from "@/queries/dashboard";
import { rootedRead } from "../client";

type Month = { readonly month: number; readonly year: number };

export const calendar = {
  view: rootedRead("calendar", {
    key: ({ view, month, year }: CalendarQuery) => ["calendar", view, month, year] as const,
    load: ({ view, month, year }) => getCalendar({ view, month, year }),
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
  releases: rootedRead("calendar", {
    key: ({ month, year }: Month) => ["releaseCalendar", month, year] as const,
    load: ({ month, year }) => getReleaseCalendar(month, year),
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
};
