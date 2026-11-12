import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { redisSchema } from "./schemas";
import { panicOnInvalidEnv } from "./panic-on-invalid-env";

export const env = createEnv({
  server: {
    ...redisSchema,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: panicOnInvalidEnv,
});
