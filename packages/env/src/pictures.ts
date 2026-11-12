import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { databaseSchema, itemPictureBucketSchema } from "./schemas";
import { panicOnInvalidEnv } from "./panic-on-invalid-env";

export const env = createEnv({
  server: {
    ...databaseSchema,
    ...itemPictureBucketSchema,
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: panicOnInvalidEnv,
});
