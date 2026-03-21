import type { Currency } from "@myakiba/contracts/shared/types";

const CURRENCY_LOCALE_MAP: Readonly<Record<Currency, string>> = {
  JPY: "ja-JP",
  EUR: "de-DE",
  CNY: "zh-CN",
  GBP: "en-GB",
  CAD: "en-CA",
  AUD: "en-AU",
  NZD: "en-NZ",
  USD: "en-US",
};

/**
 * Returns the app's canonical locale for a supported currency.
 *
 * This is intentionally a fixed one-to-one mapping used by the UI when formatting
 * money. It does not attempt to guess or fall back to another locale.
 *
 * Input:
 * - `currency`: a supported ISO currency code used by the app, such as `"USD"` or `"JPY"`
 *
 * Output:
 * - the locale string paired with that currency, such as `"en-US"` or `"ja-JP"`
 *
 * Examples:
 * - `getCurrencyLocale("USD")` -> `"en-US"`
 * - `getCurrencyLocale("JPY")` -> `"ja-JP"`
 * - `getCurrencyLocale("EUR")` -> `"de-DE"`
 */
export function getCurrencyLocale(currency: string): string {
  return CURRENCY_LOCALE_MAP[currency as Currency];
}
