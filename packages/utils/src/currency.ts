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
 * - `formatCurrencyFromMinorUnits(12345, "EUR", "de-DE")` -> `"123,45 €"`
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
    currency: currency,
  }).format(amountMajorUnits);
}

/**
 * Parses a user-entered money string into integer minor units.
 *
 * Input:
 * - `input`: a string that may contain digits, a leading minus sign, a decimal point,
 *   commas, spaces, or currency symbols
 *
 * Output:
 * - an integer amount in minor units, where `12345` means `123.45`
 *
 * Notes:
 * - empty input returns `0`
 * - extra formatting characters like `$`, `,`, and spaces are ignored
 * - values are truncated to 2 decimal places
 *
 * Examples:
 * - `parseMoneyToMinorUnits("123.45")` -> `12345`
 * - `parseMoneyToMinorUnits("$1,234.50")` -> `123450`
 * - `parseMoneyToMinorUnits("-9.99")` -> `-999`
 * - `parseMoneyToMinorUnits("")` -> `0`
 */
export function parseMoneyToMinorUnits(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 0;

  // Keep digits, minus sign, and dot. Strip commas/spaces/currency symbols.
  const normalized = trimmed.replace(/[^\d.-]/g, "");
  const isNegative = normalized.startsWith("-");
  const withoutSign = isNegative ? normalized.slice(1) : normalized;

  const [rawWhole = "0", rawFraction = ""] = withoutSign.split(".", 2);
  const whole = rawWhole.replace(/\D/g, "");
  const fraction = rawFraction.replace(/\D/g, "");

  const safeWhole = whole.length === 0 ? "0" : whole;

  const paddedFraction = fraction.padEnd(2, "0").slice(0, 2);
  const minorUnitsString = `${safeWhole}${paddedFraction}`;
  const minorUnits = Number(minorUnitsString.length === 0 ? "0" : minorUnitsString);

  return isNegative ? -minorUnits : minorUnits;
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

/**
 * Converts a major-unit string into integer minor units.
 *
 * This is an alias for `parseMoneyToMinorUnits()` and exists to make call sites
 * read more clearly when the input is already known to be a major-unit string.
 *
 * Input:
 * - `input`: a major-unit money string such as `"123.45"`
 *
 * Output:
 * - an integer amount in minor units
 *
 * Examples:
 * - `majorStringToMinorUnits("123.45")` -> `12345`
 * - `majorStringToMinorUnits("50")` -> `5000`
 * - `majorStringToMinorUnits("-9.99")` -> `-999`
 */
export function majorStringToMinorUnits(input: string): number {
  return parseMoneyToMinorUnits(input);
}
