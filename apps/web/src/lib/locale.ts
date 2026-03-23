import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { Currency } from "@myakiba/contracts/shared/types";

const CURRENCY_LOCALE_MAP: Readonly<Record<Currency, string>> = {
  BRL: "pt-BR",
  JPY: "ja-JP",
  EUR: "de-DE",
  CNY: "zh-CN",
  GBP: "en-GB",
  CAD: "en-CA",
  AUD: "en-AU",
  HKD: "zh-HK",
  NZD: "en-NZ",
  PHP: "en-PH",
  RUB: "ru-RU",
  SGD: "en-SG",
  USD: "en-US",
};

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const DEFAULT_UNSUPPORTED_CURRENCY_LOCALE = "en-US";

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
export function getCurrencyLocale(currency: Currency): string {
  return CURRENCY_LOCALE_MAP[currency];
}

function resolveCurrencyFormat(
  currency: string | null | undefined,
  fallbackCurrency: Currency,
): {
  readonly currency: string;
  readonly locale: string;
} {
  const fallbackLocale = getCurrencyLocale(fallbackCurrency);
  if (!currency) {
    return { currency: fallbackCurrency, locale: fallbackLocale };
  }

  const normalizedCurrency = currency.trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(normalizedCurrency)) {
    return { currency: fallbackCurrency, locale: fallbackLocale };
  }

  return {
    currency: normalizedCurrency,
    locale:
      normalizedCurrency in CURRENCY_LOCALE_MAP
        ? getCurrencyLocale(normalizedCurrency as Currency)
        : DEFAULT_UNSUPPORTED_CURRENCY_LOCALE,
  };
}

export function formatReleaseDate(
  valueMinorUnits: number,
  currency: string | null | undefined,
  fallbackCurrency: Currency,
): string {
  const resolvedCurrencyFormat = resolveCurrencyFormat(currency, fallbackCurrency);
  return formatCurrencyFromMinorUnits(
    valueMinorUnits,
    resolvedCurrencyFormat.currency,
    resolvedCurrencyFormat.locale,
  );
}
