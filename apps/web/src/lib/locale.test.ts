import { expect, test } from "bun:test";
import { localeFormats } from "./locale";

const SAVED = { currency: "USD", dateFormat: "MM/DD/YYYY" } as const;

test("a locale whose region has no supported currency keeps the saved currency", () => {
  for (const locale of ["uk-UA", "es-419", "ar"]) {
    expect(localeFormats(locale, { ...SAVED, currency: "CAD" }).currency, locale).toBe("CAD");
  }
});

test("a locale picks its region's currency and its date order", () => {
  expect(localeFormats("de-AT", SAVED)).toEqual({ currency: "EUR", dateFormat: "DD/MM/YYYY" });
  expect(localeFormats("ko-KR", SAVED)).toEqual({ currency: "KRW", dateFormat: "YYYY/MM/DD" });
});

test("an empty or malformed language tag keeps the saved formats", () => {
  for (const locale of ["", "en_US", "not a tag"]) {
    expect(localeFormats(locale, SAVED), JSON.stringify(locale)).toEqual(SAVED);
  }
});
