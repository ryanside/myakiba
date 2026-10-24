import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { databaseSchema } from "./schemas";
import { panicOnInvalidEnv } from "./panic-on-invalid-env";

// db package uses this, and the server + worker uses the db package
export const env = createEnv({
  server: {
    ...databaseSchema,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: panicOnInvalidEnv,
});
