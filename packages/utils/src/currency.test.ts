import { describe, expect, test } from "bun:test";
import { formatCurrencyFromMinorUnits, parseMoneyInputToMinorUnits as parse } from "./currency";

describe("strict money input", () => {
  test.each([
    ["", 0],
    ["  ", 0],
    ["0", 0],
    ["  12.50 \n", 1250],
    ["1234", 123_400],
    ["1,234.5", 123_450],
    ["1,234,567", 123_456_700],
    ["12.01", 1201],
    [".50", 50],
    [".5", 50],
    ["12.", 1200],
    ["1,234.", 123_400],
    ["0001.05", 105],
    ["90,071,992,547,409.91", 9_007_199_254_740_991],
  ] as const)("accepts %j as %i minor units", (input, expected) => {
    expect(parse(input)).toMatchObject({ status: "ok", value: expected });
  });

  test.each([
    ["12,50", "format"],
    ["1.2.3", "format"],
    ["1-2", "format"],
    ["-5", "negative"],
    ["-0", "negative"],
    ["1,234.567", "precision"],
    ["abc", "format"],
    ["12,34", "format"],
    ["1234,567", "format"],
    ["1,,234", "format"],
    ["1,234,56", "format"],
    ["$12", "format"],
    ["+5", "format"],
    ["1 234", "format"],
    ["1e3", "format"],
    [".", "format"],
    ["1.234", "precision"],
    ["90071992547409.92", "unsafe_integer"],
    ["9".repeat(400), "unsafe_integer"],
  ] as const)("rejects %j for %s", (input, rule) => {
    expect(parse(input)).toMatchObject({
      status: "error",
      error: { _tag: "MoneyInputInvalid", input, rule },
    });
  });
});

test("currency formatting normalizes the full-width yen sign", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, "format");
  if (!descriptor) throw new Error("Intl.NumberFormat.format descriptor is missing");
  try {
    Object.defineProperty(Intl.NumberFormat.prototype, "format", {
      configurable: true,
      get() {
        return () => "￥50";
      },
    });
    expect(formatCurrencyFromMinorUnits(5000, "JPY", "ja-JP")).toBe("¥50");
    expect(formatCurrencyFromMinorUnits(5000, "JPY", "ja-JP", { compact: true })).toBe("¥50");
  } finally {
    Object.defineProperty(Intl.NumberFormat.prototype, "format", descriptor);
  }
});

test("currency formatting preserves exact minor units by default", () => {
  expect(formatCurrencyFromMinorUnits(12_345, "USD", "en-US")).toBe("$123.45");
  expect(formatCurrencyFromMinorUnits(-999, "USD", "en-US")).toBe("-$9.99");
  expect(formatCurrencyFromMinorUnits(0, "USD", "en-US")).toBe("$0.00");
});

test("compact currency formatting rounds chart axes to at most one decimal", () => {
  expect(formatCurrencyFromMinorUnits(825_000, "USD", "en-US", { compact: true })).toBe("$8.3K");
  expect(formatCurrencyFromMinorUnits(800_000, "USD", "en-US", { compact: true })).toBe("$8K");
  expect(formatCurrencyFromMinorUnits(-125_000, "USD", "en-US", { compact: true })).toBe("-$1.3K");
  expect(formatCurrencyFromMinorUnits(0, "USD", "en-US", { compact: true })).toBe("$0");
  expect(formatCurrencyFromMinorUnits(12_345, "USD", "en-US", { compact: false })).toBe("$123.45");
});
