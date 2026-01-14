import { z } from "zod";

export const redisSchema = {
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().min(1).max(65535),
} as const;

export const databaseSchema = {
  DATABASE_URL: z.url(),
} as const;

export const nodeEnvSchema = {
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
} as const;
