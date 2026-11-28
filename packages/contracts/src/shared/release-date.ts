import * as z from "zod";
import { RELEASE_DATE_PRECISIONS } from "./constants";

/**
 * A release date and how much of it is known. `start` is the first day of the known period, so a
 * June 2026 release starts 2026-06-01 and sorts and filters as that day.
 */
export const releaseDateSchema = z.strictObject({
  start: z.iso.date(),
  precision: z.enum(RELEASE_DATE_PRECISIONS),
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

/** A release date a user picked on a calendar, which always names its day. */
export function releaseDateOnDay(start: string | null): ReleaseDate | null {
  return start === null ? null : { start, precision: "day" };
}

/** A key that tells release dates apart by start and precision, for grouping and select values. */
export function releaseDateKey(date: ReleaseDate): string {
  return `${date.start} ${date.precision}`;
}
