import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { redisSchema, nodeEnvSchema } from "./schemas";

export const env = createEnv({
  server: {
    ...redisSchema,
    ...nodeEnvSchema,
    HTTP_PROXY: z.url().optional(),
    AWS_BUCKET_REGION: z.string().min(1),
    AWS_BUCKET_NAME: z.string().min(1),
    MOCK_SCRAPE_PROGRESS: z
      .string()
      .optional()
      .transform((val) => val === "true"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
