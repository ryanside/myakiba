import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { redisSchema } from "./schemas";

export const env = createEnv({
  server: {
    ...redisSchema,
    CORS_ORIGIN: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
