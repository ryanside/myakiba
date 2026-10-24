import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { nodeEnvSchema, redisSchema } from "./schemas";
import { panicOnInvalidEnv } from "./panic-on-invalid-env";

export const env = createEnv({
  server: {
    ...redisSchema,
    ...nodeEnvSchema,
    BUILD_ID: z.string().optional().default("dev"),
    POSTHOG_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: panicOnInvalidEnv,
});
