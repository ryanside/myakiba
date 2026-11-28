import { expect, test } from "bun:test";
import { releaseDateSchema } from "./release-date";

test.each([
  { start: "2026-06-18", precision: "day" },
  { start: "2026-06-01", precision: "month" },
  { start: "2026-01-01", precision: "year" },
])("a release date that starts its period is accepted: %o", (date) => {
  expect(releaseDateSchema.safeParse(date).success).toBe(true);
});

test("a month that does not start on the 1st is refused", () => {
  expect(releaseDateSchema.safeParse({ start: "2026-06-18", precision: "month" }).success).toBe(
    false,
  );
});

test("a year that does not start on January 1 is refused", () => {
  expect(releaseDateSchema.safeParse({ start: "2026-11-01", precision: "year" }).success).toBe(
    false,
  );
});

test("a year off January 1 gets the year's one message, not the month's too", () => {
  const parsed = releaseDateSchema.safeParse({ start: "2026-11-18", precision: "year" });
  expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)).toEqual([
    "A year starts on January 1",
  ]);
});
