/**
 * Currency helpers.
 *
 * All persisted monetary values are stored as integer minor units (e.g. cents for USD).
 */
export function formatCurrencyFromMinorUnits(
  valueMinorUnits: number,
  currency: string = "USD"
): string {
  const locale = getCurrencyLocale(currency);
  const fractionDigits = getCurrencyFractionDigits(currency);
  const divisor = Math.pow(10, fractionDigits);
  const amountMajorUnits = valueMinorUnits / divisor;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMajorUnits);
}

export function parseMoneyToMinorUnits(
  input: string,
  currency: string = "USD"
): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 0;

  const fractionDigits = getCurrencyFractionDigits(currency);

  // Keep digits, minus sign, and dot. Strip commas/spaces/currency symbols.
  const normalized = trimmed.replace(/[^\d.-]/g, "");
  const isNegative = normalized.startsWith("-");
  const withoutSign = isNegative ? normalized.slice(1) : normalized;

  const [rawWhole = "0", rawFraction = ""] = withoutSign.split(".", 2);
  const whole = rawWhole.replace(/\D/g, "");
  const fraction = rawFraction.replace(/\D/g, "");

  const safeWhole = whole.length === 0 ? "0" : whole;

  if (fractionDigits === 0) {
    const value = Number(safeWhole);
    return isNegative ? -value : value;
  }

  const paddedFraction = fraction.padEnd(fractionDigits, "0").slice(0, fractionDigits);
  const minorUnitsString = `${safeWhole}${paddedFraction}`;
  const minorUnits = Number(minorUnitsString.length === 0 ? "0" : minorUnitsString);

  return isNegative ? -minorUnits : minorUnits;
}

export function getCurrencyFractionDigits(currency: string = "USD"): number {
  try {
    const resolved = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).resolvedOptions();
    return resolved.maximumFractionDigits ?? 2;
  } catch {
    // Invalid currency code or missing ICU data; default to typical 2 decimals.
    return 2;
  }
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

