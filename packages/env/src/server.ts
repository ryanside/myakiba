import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { itemPictureBucketSchema, redisSchema } from "./schemas";

export const env = createEnv({
  server: {
    ...redisSchema,
    ...itemPictureBucketSchema,
    CORS_ORIGIN: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_API_KEY: z.string().min(1).optional(),
    BUILD_ID: z.string().optional().default("dev"),
    POSTHOG_API_KEY: z.string().min(1).optional(),
    // Named so the AWS SDK does not read it on its own, as it does AWS_ENDPOINT_URL.
    S3_ENDPOINT_URL: z.url().optional(),
  },
  createFinalSchema: (variables) =>
    z.object(variables).refine((parsed) => !parsed.S3_ENDPOINT_URL || parsed.AWS_BUCKET_URL, {
      message: "Set AWS_BUCKET_URL when S3_ENDPOINT_URL points at a store other than AWS",
      path: ["AWS_BUCKET_URL"],
    }),
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
