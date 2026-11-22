import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";

const CURRENCY_LOCALE_MAP = {
  BRL: "pt-BR",
  JPY: "ja-JP",
  KRW: "ko-KR",
  EUR: "de-DE",
  CNY: "zh-CN",
  GBP: "en-GB",
  CAD: "en-CA",
  AUD: "en-AU",
  AED: "en-AE",
  HKD: "zh-HK",
  TWD: "zh-TW",
  NZD: "en-NZ",
  PHP: "en-PH",
  RUB: "ru-RU",
  SGD: "en-SG",
  THB: "th-TH",
  IDR: "id-ID",
  MYR: "ms-MY",
  VND: "vi-VN",
  INR: "en-IN",
  MXN: "es-MX",
  PLN: "pl-PL",
  CHF: "de-CH",
  SEK: "sv-SE",
  NOK: "nb-NO",
  DKK: "da-DK",
  CZK: "cs-CZ",
  HUF: "hu-HU",
  RON: "ro-RO",
  TRY: "tr-TR",
  ZAR: "en-ZA",
  SAR: "en-SA",
  ILS: "en-IL",
  CLP: "es-CL",
  COP: "es-CO",
  PEN: "es-PE",
  USD: "en-US",
} satisfies Readonly<Record<Currency, string>>;

export const CURRENCY_LABELS = {
  AED: "UAE Dirham",
  AUD: "Australian Dollar",
  BRL: "Brazilian Real",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  CLP: "Chilean Peso",
  CNY: "Chinese Renminbi",
  COP: "Colombian Peso",
  CZK: "Czech Koruna",
  DKK: "Danish Krone",
  EUR: "Euro",
  GBP: "Pound Sterling",
  HKD: "Hong Kong Dollar",
  HUF: "Hungarian Forint",
  IDR: "Indonesian Rupiah",
  ILS: "Israeli New Shekel",
  INR: "Indian Rupee",
  JPY: "Japanese Yen",
  KRW: "South Korean Won",
  MXN: "Mexican Peso",
  MYR: "Malaysian Ringgit",
  NOK: "Norwegian Krone",
  NZD: "New Zealand Dollar",
  PEN: "Peruvian Sol",
  PHP: "Philippine Peso",
  PLN: "Polish Zloty",
  RON: "Romanian Leu",
  RUB: "Russian Ruble",
  SAR: "Saudi Riyal",
  SEK: "Swedish Krona",
  SGD: "Singapore Dollar",
  THB: "Thai Baht",
  TRY: "Turkish Lira",
  TWD: "New Taiwan Dollar",
  USD: "United States Dollar",
  VND: "Vietnamese Dong",
  ZAR: "South African Rand",
} satisfies Readonly<Record<Currency, string>>;

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const DEFAULT_UNSUPPORTED_CURRENCY_LOCALE = "en-US";

export function getCurrencyLocale(currency: Currency): string {
  return CURRENCY_LOCALE_MAP[currency];
}

function resolveCurrencyFormat(currency: string | null | undefined, fallbackCurrency: Currency) {
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

export function formatReleasePrice(
  valueMinorUnits: number | null | undefined,
  currency: string | null | undefined,
  fallbackCurrency: Currency,
): string | null {
  if (valueMinorUnits == null || valueMinorUnits <= 0 || !currency?.trim()) return null;

  const resolvedCurrencyFormat = resolveCurrencyFormat(currency, fallbackCurrency);
  return formatCurrencyFromMinorUnits(
    valueMinorUnits,
    resolvedCurrencyFormat.currency,
    resolvedCurrencyFormat.locale,
  );
}

/** The regions that use each currency, by ISO 3166 region code. */
const CURRENCY_REGIONS = {
  AED: ["AE"],
  AUD: ["AU", "CC", "CX", "KI", "NF", "NR", "TV"],
  BRL: ["BR"],
  CAD: ["CA"],
  CHF: ["CH", "LI"],
  CLP: ["CL"],
  CNY: ["CN"],
  COP: ["CO"],
  CZK: ["CZ"],
  DKK: ["DK", "FO", "GL"],
  EUR: [
    "AD",
    "AT",
    "AX",
    "BE",
    "BG",
    "BL",
    "CY",
    "DE",
    "EE",
    "ES",
    "FI",
    "FR",
    "GF",
    "GP",
    "GR",
    "HR",
    "IE",
    "IT",
    "LT",
    "LU",
    "LV",
    "MC",
    "ME",
    "MF",
    "MQ",
    "MT",
    "NL",
    "PM",
    "PT",
    "RE",
    "SI",
    "SK",
    "SM",
    "VA",
    "XK",
    "YT",
  ],
  GBP: ["GB", "GG", "IM", "JE"],
  HKD: ["HK"],
  HUF: ["HU"],
  IDR: ["ID"],
  ILS: ["IL", "PS"],
  INR: ["IN"],
  JPY: ["JP"],
  KRW: ["KR"],
  MXN: ["MX"],
  MYR: ["MY"],
  NOK: ["NO", "SJ"],
  NZD: ["CK", "NU", "NZ", "PN", "TK"],
  PEN: ["PE"],
  PHP: ["PH"],
  PLN: ["PL"],
  RON: ["RO"],
  RUB: ["RU"],
  SAR: ["SA"],
  SEK: ["SE"],
  SGD: ["SG"],
  THB: ["TH"],
  TRY: ["TR"],
  TWD: ["TW"],
  USD: ["AS", "EC", "FM", "GU", "MH", "MP", "PR", "PW", "SV", "TL", "US", "VI"],
  VND: ["VN"],
  ZAR: ["ZA"],
} satisfies Readonly<Record<Currency, readonly string[]>>;

const REGION_CURRENCY = new Map<string, Currency>(
  Object.entries(CURRENCY_REGIONS).flatMap(([currency, regions]) =>
    regions.map((region) => [region, currency as Currency] as const),
  ),
);

const DATE_FORMAT_BY_ORDER = new Map<string, DateFormat>([
  ["month day year", "MM/DD/YYYY"],
  ["day month year", "DD/MM/YYYY"],
  ["year month day", "YYYY/MM/DD"],
  ["year day month", "YYYY/DD/MM"],
]);

type Formats = { readonly currency: Currency; readonly dateFormat: DateFormat };

/** The currency and date format a browser locale suggests, or `fallback`'s where it suggests none. */
export function localeFormats(locale: string, fallback: Formats): Formats {
  const { region } = new Intl.Locale(locale).maximize();
  const order = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts()
    .map((part) => part.type)
    .filter((type) => type === "year" || type === "month" || type === "day")
    .join(" ");
  return {
    currency: (region === undefined ? undefined : REGION_CURRENCY.get(region)) ?? fallback.currency,
    dateFormat: DATE_FORMAT_BY_ORDER.get(order) ?? fallback.dateFormat,
  };
}
