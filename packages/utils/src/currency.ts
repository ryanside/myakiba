/**
 * Formats a numeric value as currency in the appropriate locale.
 */
export function formatCurrency(
  value: string | number,
  currency: string = "USD"
): string {
  const amount = parseFloat(String(value || 0));

  switch (currency) {
    case "JPY":
      return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "EUR":
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "CNY":
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "USD":
    default:
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(amount);
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

