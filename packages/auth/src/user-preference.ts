import type { DBPrimitive } from "better-auth";
import { Result } from "better-result";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { CURRENCIES, DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import { InvalidUserPreference } from "./errors/invalid-user-preference";

const preferences = { currency: z.enum(CURRENCIES), dateFormat: z.enum(DATE_FORMATS) };

export function parseUserPreference(
  preference: keyof typeof preferences,
  value: DBPrimitive,
): string {
  const parsed = preferences[preference].safeParse(value);
  const result = parsed.success
    ? Result.ok(parsed.data)
    : Result.err(new InvalidUserPreference(preference));
  if (result.isOk()) return result.value;
  throw new APIError("BAD_REQUEST", {
    code: "INVALID_USER_PREFERENCE",
    message: result.error.message,
  });
}
