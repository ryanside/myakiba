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
    eval: async (_script: string, _keys: number, key: string) => {
      const count = Number(storage.get(key) ?? 0) + 1;
      storage.set(key, String(count));
      return count;
    },
  },
}));
initLogger({ silent: true });
const { auth } = await import("./server");

const authWithoutPlugins = betterAuth({
  ...auth.options,
  database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
  plugins: [],
});

async function signIn(headers: Record<string, string>): Promise<number> {
  const response = await authWithoutPlugins.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3001", ...headers },
      body: JSON.stringify({ email: "collector@example.com", password: "wrong-password-1" }),
    }),
  );
  return response.status;
}

test("a new X-Forwarded-For on each sign-in guess still reaches the limit", async () => {
  storage.clear();
  const statuses: number[] = [];
  for (const address of ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4"]) {
    statuses.push(await signIn({ "x-forwarded-for": address }));
  }
  expect(statuses).toEqual([401, 401, 401, 429]);
});

test("the limit follows cf-connecting-ip, which Cloudflare sets", async () => {
  storage.clear();
  const statuses: number[] = [];
  for (const address of ["198.51.100.1", "198.51.100.1", "198.51.100.1", "198.51.100.2"]) {
    statuses.push(await signIn({ "cf-connecting-ip": address }));
  }
  expect(statuses).toEqual([401, 401, 401, 401]);
});
