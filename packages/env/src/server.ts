import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { itemPictureBucketSchema, redisSchema } from "./schemas";
import { panicOnInvalidEnv } from "./panic-on-invalid-env";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);
const isLoopback = (url: URL): boolean => LOOPBACK_HOSTS.has(url.hostname);

/**
 * Why a CORS_ORIGIN entry cannot be trusted, or null. An entry is a bare origin, as browsers send
 * it. It is https, except a loopback origin during development, or in a production build that
 * itself runs on loopback, such as the image smoke.
 */
function corsOriginProblem(entry: string, localServer: boolean): string | null {
  const url = URL.parse(entry);
  if (!url || url.origin !== entry) return `${entry} is not an origin such as https://myakiba.app`;
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && isLoopback(url) && localServer) return null;
  return `${entry} must use https`;
}

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
    BETTER_AUTH_SECRET: z.string().min(32, "Use a random secret of at least 32 characters"),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_API_KEY: z.string().min(1).optional(),
    BUILD_ID: z.string().optional().default("dev"),
    NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
    OPENAPI_AUTH_DOCS: z.stringbool().optional().default(false),
    STATIC_ASSETS_DIR: z.string().min(1).optional(),
    POSTHOG_API_KEY: z.string().min(1).optional(),
    // Named so the AWS SDK does not read it on its own, as it does AWS_ENDPOINT_URL.
    S3_ENDPOINT_URL: z.url().optional(),
  },
  createFinalSchema: (variables) =>
    z
      .object(variables)
      .refine((parsed) => !parsed.S3_ENDPOINT_URL || parsed.AWS_BUCKET_URL, {
        message: "Set AWS_BUCKET_URL when S3_ENDPOINT_URL points at a store other than AWS",
        path: ["AWS_BUCKET_URL"],
      })
      .superRefine((parsed, ctx) => {
        const localServer =
          parsed.NODE_ENV !== "production" || isLoopback(new URL(parsed.BETTER_AUTH_URL));
        for (const entry of parsed.CORS_ORIGIN.split(",").map((origin) => origin.trim())) {
          const problem = corsOriginProblem(entry, localServer);
          if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["CORS_ORIGIN"] });
        }
      }),
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: panicOnInvalidEnv,
});
