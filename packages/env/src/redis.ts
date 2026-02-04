import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { redisSchema } from "./schemas";

export const env = createEnv({
  server: {
    ...redisSchema,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
