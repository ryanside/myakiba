import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Panic } from "better-result";

const valid = {
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: "6379",
  AWS_BUCKET_REGION: "us-east-1",
  AWS_BUCKET_NAME: "pictures",
  CORS_ORIGIN: "https://myakiba.app",
  RESEND_API_KEY: "key",
  RESEND_FROM_EMAIL: "noreply@example.com",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  TURNSTILE_SECRET_KEY: "key",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://myakiba.app",
  NODE_ENV: "production",
};

const savedEnv = { ...process.env };
let loads = 0;

beforeEach(() => {
  spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of Object.keys(process.env)) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, savedEnv);
});

/** Loads a fresh server env from `changes` over a valid production config. */
async function load(changes: Record<string, string>) {
  for (const key of Object.keys(process.env)) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, valid, changes);
  loads += 1;
  return await import(`./server?load=${loads}`);
}

test.each([
  [
    "a 31-character BETTER_AUTH_SECRET",
    { BETTER_AUTH_SECRET: "s".repeat(31) },
    "BETTER_AUTH_SECRET",
  ],
  ["a CORS_ORIGIN entry with no scheme", { CORS_ORIGIN: "myakiba.app" }, "CORS_ORIGIN"],
  ["a CORS_ORIGIN entry with a path", { CORS_ORIGIN: "https://myakiba.app/" }, "CORS_ORIGIN"],
  ["an http CORS_ORIGIN entry", { CORS_ORIGIN: "http://myakiba.app" }, "CORS_ORIGIN"],
  [
    "an http://localhost CORS_ORIGIN entry on a public production server",
    { CORS_ORIGIN: "https://myakiba.app, http://localhost:3001" },
    "CORS_ORIGIN",
  ],
] as const)("the server refuses to start with %s", async (_case, changes, name) => {
  const loading = load(changes);
  await expect(loading).rejects.toBeInstanceOf(Panic);
  await expect(loading).rejects.toThrow(`Invalid environment variables: ${name}.`);
});

test.each([
  ["several https origins", { CORS_ORIGIN: "https://myakiba.app, https://www.myakiba.app" }],
  [
    "http://localhost in development",
    {
      NODE_ENV: "development",
      CORS_ORIGIN: "http://localhost:3001",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  ],
  [
    "http://localhost in a production build that itself runs on localhost",
    { CORS_ORIGIN: "http://localhost:3000", BETTER_AUTH_URL: "http://localhost:3000" },
  ],
] as const)("the server starts with %s", async (_case, changes) => {
  const { env } = await load(changes);
  expect(env.CORS_ORIGIN).toBe(changes.CORS_ORIGIN);
});
