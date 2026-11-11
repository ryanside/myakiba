import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Panic } from "better-result";

const SECRET = "s3cret-value";
const validRedis = { REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379" };
const validServer = {
  ...validRedis,
  AWS_BUCKET_REGION: "us-east-1",
  AWS_BUCKET_NAME: "pictures",
  CORS_ORIGIN: "http://localhost:3001",
  RESEND_API_KEY: "key",
  RESEND_FROM_EMAIL: "noreply@example.com",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  TURNSTILE_SECRET_KEY: "key",
  BETTER_AUTH_SECRET: "secret-secret-secret-secret-secret",
  BETTER_AUTH_URL: "http://localhost:3000",
};

const savedEnv = { ...process.env };
let printed: unknown[][] = [];

beforeEach(() => {
  printed = [];
  spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    printed.push(args);
  });
});

afterEach(() => {
  for (const key of Object.keys(process.env)) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, savedEnv);
});

test.each([
  ["shared", () => import("./shared"), { DATABASE_URL: SECRET }, "DATABASE_URL"],
  ["redis", () => import("./redis"), { ...validRedis, REDIS_PORT: SECRET }, "REDIS_PORT"],
  [
    "server",
    () => import("./server"),
    { ...validServer, S3_ENDPOINT_URL: "http://127.0.0.1:9000" },
    "AWS_BUCKET_URL",
  ],
  [
    "web",
    () => import("./web"),
    { VITE_SERVER_URL: SECRET, VITE_TURNSTILE_SITE_KEY: "key" },
    "VITE_SERVER_URL",
  ],
  ["extension", () => import("./extension"), { WXT_WEB_ORIGIN: SECRET }, "WXT_WEB_ORIGIN"],
] as const)(
  "the %s env prints the issues and panics naming only the invalid variables",
  async (_module, load, env, names) => {
    Object.assign(process.env, env);

    const loading = load();

    await expect(loading).rejects.toBeInstanceOf(Panic);
    await expect(loading).rejects.toThrow(
      new Error(
        `Invalid environment variables: ${names}. The process cannot start with them. Fix each one as the issues printed above describe.`,
      ),
    );
    expect(printed).toEqual([["❌ Invalid environment variables:", expect.any(Array)]]);
  },
);
