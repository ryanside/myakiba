import { expect, mock, test } from "bun:test";
import { initLogger } from "evlog";

process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "1";
process.env.DATABASE_URL = "postgres://unused@127.0.0.1:1/unused";
const storage = new Map<string, string>();
await mock.module("@myakiba/redis/client", () => ({
  redis: {
    get: async (key: string) => storage.get(key) ?? null,
    set: async (key: string, value: string) => storage.set(key, value),
    del: async (key: string) => storage.delete(key),
    eval: async (_script: string, _keys: number, key: string) => {
      const count = Number(storage.get(key) ?? 0) + 1;
      storage.set(key, String(count));
      return count;
    },
  },
}));
initLogger({ silent: true });
const { auth } = await import("./server");

const BODIES = {
  "/sign-up/email": { name: "Collector", email: "new@example.com", password: "password-123456" },
  "/sign-in/email": { email: "collector@example.com", password: "password-123456" },
  "/sign-in/username": { username: "collector", password: "password-123456" },
  "/request-password-reset": { email: "collector@example.com" },
  "/send-verification-email": { email: "collector@example.com" },
} as const;

test.each(Object.keys(BODIES) as (keyof typeof BODIES)[])(
  "%s without a Turnstile token answers 400",
  async (path) => {
    storage.clear();
    const response = await auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3001" },
        body: JSON.stringify(BODIES[path]),
      }),
    );
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 400,
      body: { code: "MISSING_RESPONSE", message: "Missing CAPTCHA response" },
    });
  },
);
