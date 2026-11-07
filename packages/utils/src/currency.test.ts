import { expect, test } from "bun:test";
import { formatCurrencyFromMinorUnits } from "./currency";

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
