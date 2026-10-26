import { Result } from "better-result";
import { MoneyInputInvalid } from "./errors/money-input-invalid";

/**
 * Formats an integer minor-unit amount as a localized currency string.
 *
 * Input:
 * - `valueMinorUnits`: whole minor units, where `100` means `1.00`
 * - `currency`: ISO currency code, such as `"USD"` or `"JPY"`
 * - `locale`: locale used by `Intl.NumberFormat`, such as `"en-US"` or `"ja-JP"`
 *
 * Output:
 * - a display-ready currency string for the given locale and currency
 *
 * Examples:
 * - `formatCurrencyFromMinorUnits(12345, "USD", "en-US")` -> `"$123.45"`
 * - `formatCurrencyFromMinorUnits(12345, "EUR", "de-DE")` -> `"123,45\u00A0€"`
 * - `formatCurrencyFromMinorUnits(5000, "JPY", "ja-JP")` -> `"￥50"`
 */
export function formatCurrencyFromMinorUnits(
  valueMinorUnits: number,
  currency: string,
  locale: Intl.LocalesArgument,
): string {
  const amountMajorUnits = valueMinorUnits / 100;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMajorUnits);
}

/** Parses nonnegative decimal money with optional comma thousands groups into safe minor units. */
export function parseMoneyInputToMinorUnits(input: string): Result<number, MoneyInputInvalid> {
  const text = input.trim();
  if (text === "") return Result.ok(0);
  if (text.startsWith("-")) return Result.err(new MoneyInputInvalid(input, "negative"));
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)) {
    return Result.err(new MoneyInputInvalid(input, "format"));
  }
  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > 2) return Result.err(new MoneyInputInvalid(input, "precision"));
  const minorUnits = Number(`${whole.replaceAll(",", "")}${fraction.padEnd(2, "0")}`);
  return Number.isSafeInteger(minorUnits)
    ? Result.ok(minorUnits)
    : Result.err(new MoneyInputInvalid(input, "unsafe_integer"));
}

/**
 * Converts integer minor units into a normalized major-unit string with 2 decimals.
 *
 * Input:
 * - `valueMinorUnits`: an integer amount in minor units
 *
 * Output:
 * - a base-10 string with exactly 2 decimal places
 *
 * Examples:
 * - `minorUnitsToMajorString(12345)` -> `"123.45"`
 * - `minorUnitsToMajorString(5000)` -> `"50.00"`
 * - `minorUnitsToMajorString(-999)` -> `"-9.99"`
 */
export function minorUnitsToMajorString(valueMinorUnits: number): string {
  const isNegative = valueMinorUnits < 0;
  const absValue = Math.abs(valueMinorUnits);
  const whole = Math.floor(absValue / 100);
  const fraction = absValue % 100;
  const major = `${whole}.${fraction.toString().padStart(2, "0")}`;
  return isNegative ? `-${major}` : major;
}
