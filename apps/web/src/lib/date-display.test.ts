import { describe, expect, test } from "bun:test";
import { DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";
import { formatReleaseDate, releaseCalendarOrder } from "./date-display";

const DAY: ReleaseDate = { start: "2026-06-18", precision: "day" };
const MONTH: ReleaseDate = { start: "2026-06-01", precision: "month" };
const YEAR: ReleaseDate = { start: "2026-01-01", precision: "year" };

describe("formatReleaseDate shows only what is known of a release date", () => {
  test.each([
    ["MM/DD/YYYY", "06/18/2026"],
    ["DD/MM/YYYY", "18/06/2026"],
    ["YYYY/MM/DD", "2026/06/18"],
    ["YYYY/DD/MM", "2026/18/06"],
  ] as const)("a day reads in the %s setting as %s", (format, shown) => {
    expect(formatReleaseDate(DAY, format)).toBe(shown);
  });

  test.each(DATE_FORMATS)("a month reads Jun 2026 and a year 2026 in the %s setting", (format) => {
    expect(formatReleaseDate(MONTH, format)).toBe("Jun 2026");
    expect(formatReleaseDate(YEAR, format)).toBe("2026");
  });

  test("the long and weekday forms name a day only when it is known", () => {
    expect(formatReleaseDate(DAY, "long")).toBe("June 18th, 2026");
    expect(formatReleaseDate(DAY, "weekday")).toBe("Thu, Jun 18");
    expect(formatReleaseDate(MONTH, "long")).toBe("Jun 2026");
    expect(formatReleaseDate(MONTH, "weekday")).toBe("Jun 2026");
    expect(formatReleaseDate(YEAR, "weekday")).toBe("2026");
  });

  test("no date reads n/a", () => {
    expect(formatReleaseDate(null)).toBe("n/a");
  });
});

test("the calendar puts a release known only to its month or year at the head of that period", () => {
  const juneFirst: ReleaseDate = { start: "2026-06-01", precision: "day" };
  const julyFirst: ReleaseDate = { start: "2026-07-01", precision: "day" };
  expect([julyFirst, DAY, juneFirst, MONTH].toSorted(releaseCalendarOrder)).toEqual([
    MONTH,
    juneFirst,
    DAY,
    julyFirst,
  ]);
});
