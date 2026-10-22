import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const PRODUCTION_EXTENSION_ORIGINS = {
  WXT_WEB_ORIGIN: "https://myakiba.app",
  WXT_MFC_ORIGIN: "https://myfigurecollection.net",
  WXT_MFC_STATIC_ORIGIN: "https://static.myfigurecollection.net",
} as const;

function origin(production: string) {
  return z
    .url()
    .default(production)
    .transform((value) => new URL(value).origin);
}

export const env = createEnv({
  clientPrefix: "WXT_",
  client: {
    WXT_WEB_ORIGIN: origin(PRODUCTION_EXTENSION_ORIGINS.WXT_WEB_ORIGIN),
    WXT_MFC_ORIGIN: origin(PRODUCTION_EXTENSION_ORIGINS.WXT_MFC_ORIGIN),
    WXT_MFC_STATIC_ORIGIN: origin(PRODUCTION_EXTENSION_ORIGINS.WXT_MFC_STATIC_ORIGIN),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
