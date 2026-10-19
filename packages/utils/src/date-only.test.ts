import { describe, expect, test } from "bun:test";
import { normalizeScrapedDate } from "./date-only";

describe("normalizeScrapedDate with release dates as MFC prints them", () => {
  test.each([
    ["10/13/2010", "2010-10-13"],
    ["09/18/2025", "2025-09-18"],
    ["1/5/2012", "2012-01-05"],
    ["09/2010", "2010-09-01"],
    ["2011", "2011-01-01"],
    ["2024-01-15", "2024-01-15"],
    [" 10/13/2010 ", "2010-10-13"],
  ])("%p becomes %p", (scraped, expected) => {
    expect(normalizeScrapedDate(scraped)).toBe(expected);
  });

  test.each(["", "TBD", "02/30/2024", "13/2010", "15/03/2024"])("%p is rejected", (scraped) => {
    expect(normalizeScrapedDate(scraped)).toBeNull();
  });
});
