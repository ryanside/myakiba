import { z } from "zod";

export const redisSchema = {
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().min(1).max(65_535),
} as const;

export const databaseSchema = {
  DATABASE_URL: z.url(),
} as const;

export const nodeEnvSchema = {
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
} as const;

export const itemPictureBucketSchema = {
  AWS_BUCKET_REGION: z.string().min(1),
  AWS_BUCKET_NAME: z.string().min(1),
  AWS_BUCKET_URL: z.url().optional(),
  /** An S3-compatible store such as MinIO in local and e2e runs. Unset on AWS. */
  AWS_ENDPOINT_URL: z.url().optional(),
} as const;
