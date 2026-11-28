import * as z from "zod";
import { RELEASE_DATE_PRECISIONS } from "./constants";

/**
 * A release date and how much of it is known. `start` is the first day of the known period, so a
 * June 2026 release starts 2026-06-01 and sorts and filters as that day.
 */
export const releaseDateSchema = z
  .strictObject({
    start: z.iso.date(),
    precision: z.enum(RELEASE_DATE_PRECISIONS),
  })
  .refine(({ start, precision }) => precision !== "month" || start.endsWith("-01"), {
    message: "A month starts on the 1st",
    path: ["start"],
  })
  .refine(({ start, precision }) => precision !== "year" || start.slice(5) === "01-01", {
    message: "A year starts on January 1",
    path: ["start"],
  });

export type ReleaseDate = z.infer<typeof releaseDateSchema>;

/** The latest of some release dates; of two that start on one day, the less precise, which shows no day. */
export function latestReleaseDate(values: readonly (ReleaseDate | null)[]): ReleaseDate | null {
  let latest: ReleaseDate | null = null;
  for (const value of values) {
    if (value === null) continue;
    if (
      latest === null ||
      value.start > latest.start ||
      (value.start === latest.start &&
        RELEASE_DATE_PRECISIONS.indexOf(value.precision) >
          RELEASE_DATE_PRECISIONS.indexOf(latest.precision))
    ) {
      latest = value;
    }
  }
  return latest;
}

export function releaseDateOnDay(start: string | null): ReleaseDate | null {
  return start === null ? null : { start, precision: "day" };
}

export function releaseDateKey(date: ReleaseDate): string {
  return `${date.start} ${date.precision}`;
}
