import { describe, expect, test } from "bun:test";
import { parseRetryAfter } from "./throttle";

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");

  test.each([
    ["5", 5000],
    ["0", 0],
    ["Wed, 21 Oct 2026 12:00:30 GMT", 30_000],
    ["Wed, 21 Oct 2026 11:00:00 GMT", 0],
    ["soon", null],
    ["", null],
    [null, null],
  ])("%p is %p ms", (header, expected) => {
    expect(parseRetryAfter(header, now)).toBe(expected);
  });
});
