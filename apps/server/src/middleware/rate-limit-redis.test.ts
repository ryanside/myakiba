import { afterAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import Redis from "ioredis";

const redisUrl = process.env.TEST_REDIS_URL;
if (!redisUrl) throw new Error("TEST_REDIS_URL is required for the real Redis rate limit test");

const client = new Redis(redisUrl);
const LIMIT = 60;
const WINDOW_SECONDS = 3600;
const keys: string[] = [];

await mock.module("@myakiba/redis/client", () => ({ redis: client }));
await mock.module("@myakiba/auth/server", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { readonly headers: Headers }) => ({
        user: { id: headers.get("x-test-user") },
      }),
    },
  },
}));

const { rateLimit } = await import("./rate-limit");
const app = new Elysia().use(rateLimit).get("/probe", () => "allowed", {
  rateLimit: "itemResync",
});

function newUser() {
  const user = crypto.randomUUID();
  const key = `rl:item-resync:${user}`;
  keys.push(key);
  return { user, key };
}

const hit = (user: string) =>
  app.handle(new Request("http://localhost/probe", { headers: { "x-test-user": user } }));

afterAll(async () => {
  await client.del(...keys);
  client.disconnect();
});

test("concurrent requests are counted exactly: the limit passes and the next is refused", async () => {
  const { user, key } = newUser();

  const responses = await Promise.all(Array.from({ length: LIMIT + 1 }, () => hit(user)));

  const refused = responses.filter((response) => response.status === 429);
  expect(responses.filter((response) => response.status === 200)).toHaveLength(LIMIT);
  expect(refused).toHaveLength(1);
  expect(Number(refused[0]?.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(refused[0]?.headers.get("x-ratelimit-remaining")).toBe("0");
  expect(await client.get(key)).toBe(String(LIMIT + 1));
  expect(await client.ttl(key)).toBeWithin(1, WINDOW_SECONDS + 1);
});

test("later requests do not push the window's end back", async () => {
  const { user, key } = newUser();
  await hit(user);
  await client.expire(key, 100);

  await hit(user);

  expect(await client.ttl(key)).toBeLessThanOrEqual(100);
});

test("the count starts over once the window ends", async () => {
  const { user, key } = newUser();
  await Promise.all(Array.from({ length: LIMIT + 1 }, () => hit(user)));
  const refused = await hit(user);
  expect(refused.status).toBe(429);

  await client.pexpire(key, 1);
  while ((await client.exists(key)) === 1) await Bun.sleep(1);

  const response = await hit(user);
  expect(response.status).toBe(200);
  expect(response.headers.get("x-ratelimit-remaining")).toBe(String(LIMIT - 1));
});

test("each user has a count of their own", async () => {
  const over = newUser();
  const other = newUser();
  await Promise.all(Array.from({ length: LIMIT + 1 }, () => hit(over.user)));

  const refused = await hit(over.user);
  const allowed = await hit(other.user);

  expect(refused.status).toBe(429);
  expect(allowed.status).toBe(200);
});
