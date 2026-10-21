import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

function origin(production: string) {
  return z
    .url()
    .default(production)
    .transform((value) => new URL(value).origin);
}

export const env = createEnv({
  clientPrefix: "WXT_",
  client: {
    WXT_WEB_ORIGIN: origin("https://myakiba.app"),
    WXT_MFC_ORIGIN: origin("https://myfigurecollection.net"),
    WXT_MFC_STATIC_ORIGIN: origin("https://static.myfigurecollection.net"),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
