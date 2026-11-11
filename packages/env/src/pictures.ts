import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { databaseSchema, itemPictureBucketSchema } from "./schemas";
import { panicOnInvalidEnv } from "./panic-on-invalid-env";

/** What pictures:reconcile reads: the Items and the bucket their pictures are stored in. */
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
