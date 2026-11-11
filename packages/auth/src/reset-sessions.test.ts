import { expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
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
    getdel: async (key: string) => {
      const value = storage.get(key) ?? null;
      storage.delete(key);
      return value;
    },
  },
}));
const mails: string[] = [];
await mock.module("resend", () => ({
  Resend: class {
    emails = {
      send: async ({ text }: { readonly text: string }) => {
        mails.push(text);
        return { data: { id: "mail-id" }, error: null };
      },
    };
  },
}));
initLogger({ silent: true });
const { auth } = await import("./server");

const instance = betterAuth({
  ...auth.options,
  database: memoryAdapter({
    user: [
      {
        id: "user-id",
        name: "Collector",
        email: "collector@example.com",
        emailVerified: true,
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

async function signIn(): Promise<Headers> {
  const response = await instance.api.signInEmail({
    body: { email: "collector@example.com", password: "password-123456" },
    asResponse: true,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

test("a password reset signs out every other session", async () => {
  const context = await instance.$context;
  await context.internalAdapter.linkAccount({
    userId: "user-id",
    accountId: "user-id",
    providerId: "credential",
    password: await context.password.hash("password-123456"),
  });
  const other = await signIn();
  const fresh = { query: { disableCookieCache: true } } as const;
  expect(await instance.api.getSession({ headers: other, ...fresh })).not.toBeNull();

  await instance.api.requestPasswordReset({
    body: { email: "collector@example.com", redirectTo: "http://localhost:3001/reset-password" },
  });
  const token = /reset-password\/([^?\s]+)/u.exec(mails.at(-1) ?? "")?.[1];
  if (!token) throw new Error("no reset link was mailed");
  await instance.api.resetPassword({ body: { newPassword: "new-password-123456", token } });

  expect(await instance.api.getSession({ headers: other, ...fresh })).toBeNull();
});
