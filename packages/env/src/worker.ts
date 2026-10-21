import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { itemPictureBucketSchema, nodeEnvSchema, redisSchema } from "./schemas";

export const env = createEnv({
  server: {
    ...redisSchema,
    ...nodeEnvSchema,
    ...itemPictureBucketSchema,
    WORKER_PROXY_URL: z.url().optional(),
    BUILD_ID: z.string().optional().default("dev"),
    POSTHOG_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
