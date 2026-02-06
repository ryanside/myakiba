/**
 * Currency helpers.
 *
 * All persisted monetary values are stored as integer minor units with fixed 2 decimals.
 */
export function formatCurrencyFromMinorUnits(
  valueMinorUnits: number,
  currency: string = "USD",
): string {
  const locale = getCurrencyLocale(currency);
  const amountMajorUnits = valueMinorUnits / 100;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMajorUnits);
}

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
 * Returns the appropriate locale string for a currency code.
 */
export function getCurrencyLocale(currency: string = "USD"): string {
  const localeMap: Record<string, string> = {
    JPY: "ja-JP",
    EUR: "de-DE",
    CNY: "zh-CN",
    GBP: "en-GB",
    CAD: "en-CA",
    AUD: "en-AU",
    NZD: "en-NZ",
    USD: "en-US",
  };
  return localeMap[currency] || "en-US";
}

export function minorUnitsToMajorString(valueMinorUnits: number): string {
  const isNegative = valueMinorUnits < 0;
  const absValue = Math.abs(valueMinorUnits);
  const whole = Math.floor(absValue / 100);
  const fraction = absValue % 100;
  const major = `${whole}.${fraction.toString().padStart(2, "0")}`;
  return isNegative ? `-${major}` : major;
}

export function majorStringToMinorUnits(input: string): number {
  return parseMoneyToMinorUnits(input);
}

/**
 * Back-compat: formats a major-units amount (e.g. 12.34 USD) as currency.
 * Prefer `formatCurrencyFromMinorUnits()` for persisted values.
 */
export function formatCurrency(valueMajorUnits: string | number, currency: string = "USD"): string {
  const locale = getCurrencyLocale(currency);
  const amount = typeof valueMajorUnits === "number" ? valueMajorUnits : Number(valueMajorUnits);
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(safeAmount);
}
