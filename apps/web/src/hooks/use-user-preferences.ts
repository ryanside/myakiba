import { getRouteApi } from "@tanstack/react-router";
import { getCurrencyLocale } from "@/lib/locale";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";

const appRouteApi = getRouteApi("/(app)");

export function useUserPreferences(): {
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
} {
  const { session } = appRouteApi.useRouteContext();
  // typecast needed since betterauth's auth-client.ts can only type it as string
  const currency = session.user.currency as Currency;

  return {
    currency,
    locale: getCurrencyLocale(currency),
    dateFormat: session.user.dateFormat as DateFormat, // typecast needed for same reason as above
  };
}
