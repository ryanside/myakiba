import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { panicOnInvalidEnv } from "./panic-on-invalid-env";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SERVER_URL: z.url(),
    VITE_TURNSTILE_SITE_KEY: z.string().min(1),
    VITE_BUILD_ID: z.string().optional().default("dev"),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
  onValidationError: panicOnInvalidEnv,
});
