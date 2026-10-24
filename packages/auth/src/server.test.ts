import { beforeEach, expect, mock, test } from "bun:test";
import { z } from "zod";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "1";
process.env.DATABASE_URL = "postgres://unused@127.0.0.1:1/unused";
const storage = new Map<string, string>();
let storageFailure: Error | null = null;
await mock.module("@myakiba/redis/client", () => ({
  redis: {
    get: async (key: string) => {
      if (storageFailure) throw storageFailure;
      return storage.get(key) ?? null;
    },
    set: async (key: string, value: string) => {
      if (storageFailure) throw storageFailure;
      return storage.set(key, value);
    },
    del: async (key: string) => {
      if (storageFailure) throw storageFailure;
      return storage.delete(key);
    },
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

function testAuth(requireEmailVerification = true) {
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
    emailAndPassword: { ...auth.options.emailAndPassword, requireEmailVerification },
    plugins: [],
    rateLimit: { enabled: false },
  });
}

beforeEach(() => {
  storage.clear();
  storageFailure = null;
  events.length = 0;
  sendFails = true;
});

test.each(["send-verification-email", "request-password-reset"])(
  "%s succeeds and logs when the email provider refuses the send",
  async (endpoint) => {
    const response = await testAuth().handler(
      new Request(`http://localhost:3000/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3001" },
        body: JSON.stringify({ email: "collector@example.com" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(
      events.some(
        ({ event }) =>
          z.object({ name: z.literal("SendAuthEmailFailed") }).safeParse(event.error).success,
      ),
    ).toBe(true);
  },
);
test.each(["send-verification-email", "request-password-reset"])(
  "%s succeeds when the email provider accepts the send",
  async (endpoint) => {
    sendFails = false;
    const response = await testAuth().handler(
      new Request(`http://localhost:3000/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3001" },
        body: JSON.stringify({ email: "collector@example.com" }),
      }),
    );
    expect(response.status).toBe(200);
  },
);

const invalidPreferences = [
  ["currency", "not-money", "Choose a supported currency."],
  ["dateFormat", "not-a-date-format", "Choose a supported date format."],
] as const;
test.each(invalidPreferences)("sign-up rejects unsupported %s", async (field, value, message) => {
  sendFails = false;
  const response = await testAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3001" },
      body: JSON.stringify({
        name: "New collector",
        email: "new@example.com",
        password: "password-123456",
        [field]: value,
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_USER_PREFERENCE", message });
});
test.each(invalidPreferences)(
  "update-user rejects unsupported %s",
  async (field, value, message) => {
    const instance = testAuth(false);
    const context = await instance.$context;
    await context.internalAdapter.linkAccount({
      userId: "user-id",
      accountId: "user-id",
      providerId: "credential",
      password: await context.password.hash("password-123456"),
    });
    const signedIn = await instance.api.signInEmail({
      body: { email: "collector@example.com", password: "password-123456" },
      asResponse: true,
    });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
    const response = await instance.handler(
      new Request("http://localhost:3000/api/auth/update-user", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3001", cookie },
        body: JSON.stringify({ [field]: value }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_USER_PREFERENCE", message });
    const session = await instance.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({ currency: "USD", dateFormat: "MM/DD/YYYY" });
  },
);

test("failed reset email does not disclose whether the account exists", async () => {
  const instance = testAuth();
  const statuses: number[] = [];
  for (const email of ["collector@example.com", "absent@example.com"]) {
    const response = await instance.api.requestPasswordReset({ body: { email }, asResponse: true });
    statuses.push(response.status);
  }
  expect(statuses).toEqual([200, 200]);
});

test("sign-up succeeds and logs when verification email fails", async () => {
  const response = await testAuth().api.signUpEmail({
    body: { name: "New collector", email: "new@example.com", password: "password-123456" },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  expect(
    events.some(
      ({ event }) =>
        event.action === "auth.sendEmail" &&
        event.purpose === "verification" &&
        z
          .object({ name: z.literal("SendAuthEmailFailed"), cause: z.unknown() })
          .safeParse(event.error).success,
    ),
  ).toBe(true);
});

test.each(["get", "set", "delete"] as const)(
  "session storage %s preserves its rejection and logs SessionStoreUnavailable",
  async (operation) => {
    const cause = new Error("Redis unavailable");
    storageFailure = cause;
    const secondary = auth.options.secondaryStorage;
    if (!secondary) throw new Error("secondary storage missing");
    const pending =
      operation === "set"
        ? secondary.set("private-session-key", "private-value", 60)
        : secondary[operation]("private-session-key");
    await expect(pending).rejects.toBe(cause);
    expect(events).toContainEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          action: "auth.sessionStore",
          operation,
          error: expect.objectContaining({ name: "SessionStoreUnavailable" }),
        }),
      }),
    );
    expect(JSON.stringify(events)).not.toContain("private-session-key");
    expect(JSON.stringify(events)).not.toContain("private-value");
  },
);
