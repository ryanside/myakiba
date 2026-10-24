import { beforeEach, expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "1";
process.env.DATABASE_URL = "postgres://unused@127.0.0.1:1/unused";
const storage = new Map<string, string>();
await mock.module("@myakiba/redis/client", () => ({
  redis: {
    get: async (key: string) => storage.get(key) ?? null,
    set: async (key: string, value: string) => storage.set(key, value),
    del: async (key: string) => storage.delete(key),
  },
}));
const events: DrainContext[] = [];
initLogger({
  silent: true,
  drain: (context) => {
    events.push(context);
  },
});
let sendFails = true;
await mock.module("resend", () => ({
  Resend: class {
    emails = {
      send: async () => ({
        data: sendFails ? null : { id: "mail-id" },
        error: sendFails ? { name: "application_error", message: "provider unavailable" } : null,
      }),
    };
  },
}));
const { auth } = await import("./server");

function testAuth() {
  return betterAuth({
    ...auth.options,
    database: memoryAdapter({
      user: [
        {
          id: "user-id",
          name: "Collector",
          email: "collector@example.com",
          emailVerified: false,
          currency: "USD",
          dateFormat: "MM/DD/YYYY",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      account: [],
      session: [],
      verification: [],
    }),
    plugins: [],
    rateLimit: { enabled: false },
  });
}

beforeEach(() => {
  storage.clear();
  events.length = 0;
  sendFails = true;
});

for (const endpoint of ["send-verification-email", "request-password-reset"]) {
  test(`${endpoint} fails when the email provider refuses the send`, async () => {
    const response = await testAuth().handler(
      new Request(`http://localhost:3000/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3001" },
        body: JSON.stringify({ email: "collector@example.com" }),
      }),
    );
    expect(response.status).toBe(500);
    expect(events.some(({ event }) => event.error?.name === "SendAuthEmailFailed")).toBe(true);
    expect(await response.json()).toEqual({
      code: "SEND_AUTH_EMAIL_FAILED",
      message: "We couldn't send the email. Please try again.",
    });
  });
  test(`${endpoint} succeeds when the email provider accepts the send`, async () => {
    sendFails = false;
    const response = await testAuth().handler(
      new Request(`http://localhost:3000/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3001" },
        body: JSON.stringify({ email: "collector@example.com" }),
      }),
    );
    expect(response.status).toBe(200);
  });
}
