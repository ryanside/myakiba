import { z } from "zod";

export const redisSchema = {
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().min(1).max(65_535),
  REDIS_PASSWORD: z.string().min(1).optional(),
} as const;

export const databaseSchema = {
  DATABASE_URL: z.url(),
} as const;

export const itemPictureBucketSchema = {
  AWS_BUCKET_REGION: z.string().min(1),
  AWS_BUCKET_NAME: z.string().min(1),
  AWS_BUCKET_URL: z.url().optional(),
  // Named so the AWS SDK does not read it on its own, as it does AWS_ENDPOINT_URL.
  S3_ENDPOINT_URL: z.url().optional(),
} as const;
