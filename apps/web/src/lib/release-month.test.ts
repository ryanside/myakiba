import { describe, expect, test } from "bun:test";
import { ordersPageSearchSchema } from "@myakiba/contracts/orders/schema";
import { releaseMonthRange } from "./release-month";

describe("releaseMonthRange", () => {
  test("this month runs from the 1st to the month's last day, on its first and last day", () => {
    expect(releaseMonthRange("this", "2026-11-01")).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
    });
    expect(releaseMonthRange("this", "2026-11-30")).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
    });
  });

  test("next month on the last day of a month is the whole of the month after", () => {
    expect(releaseMonthRange("next", "2026-11-30")).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
  });

  test("next month on December 31 is January of the next year", () => {
    expect(releaseMonthRange("this", "2026-12-31")).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(releaseMonthRange("next", "2026-12-31")).toEqual({
      start: "2027-01-01",
      end: "2027-01-31",
    });
  });

  test("next month on January 31 is February, 29 days in a leap year and 28 otherwise", () => {
    expect(releaseMonthRange("next", "2028-01-31")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(releaseMonthRange("next", "2027-01-31")).toEqual({
      start: "2027-02-01",
      end: "2027-02-28",
    });
  });
});

describe("the Orders page URL", () => {
  test("keeps this and next as the Release Date month", () => {
    expect(ordersPageSearchSchema.parse({ releaseMonth: "this" }).releaseMonth).toBe("this");
    expect(ordersPageSearchSchema.parse({ releaseMonth: "next" }).releaseMonth).toBe("next");
  });

  test("refuses any other month", () => {
    expect(ordersPageSearchSchema.safeParse({ releaseMonth: "last" }).success).toBe(false);
    expect(ordersPageSearchSchema.safeParse({ releaseMonth: "2026-11" }).success).toBe(false);
  });
});
