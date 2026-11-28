import { describe, expect, test } from "bun:test";
import { normalizeMfcDate } from "./date-only";

describe("normalizeMfcDate with release dates as MFC prints them", () => {
  test.each([
    ["10/13/2010", "2010-10-13", "day"],
    ["09/18/2025", "2025-09-18", "day"],
    ["1/5/2012", "2012-01-05", "day"],
    ["09/2010", "2010-09-01", "month"],
    ["2011", "2011-01-01", "year"],
    ["2024-01-15", "2024-01-15", "day"],
    [" 10/13/2010 ", "2010-10-13", "day"],
  ] as const)("%p becomes %p", (printed, start, precision) => {
    expect(normalizeMfcDate(printed)).toEqual({ start, precision });
  });

  test.each(["", "TBD", "02/30/2024", "13/2010", "15/03/2024"])("%p is rejected", (printed) => {
    expect(normalizeMfcDate(printed)).toBeNull();
  });

  test.each(["0000", "01/0000", "01/01/0000", "0000-01-01", "0999"])(
    "%p is rejected, because Postgres has no year 0 and MFC prints no year before 1000",
    (printed) => {
      expect(normalizeMfcDate(printed)).toBeNull();
    },
  );
});
