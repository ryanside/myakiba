/**
 * Formats a numeric value as currency in the appropriate locale.
 */
export function formatCurrency(
  value: string | number,
  currency: string = "USD"
): string {
  const amount = parseFloat(String(value || 0));
  const locale = getCurrencyLocale(currency);
  
  return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
    }).format(amount);
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

