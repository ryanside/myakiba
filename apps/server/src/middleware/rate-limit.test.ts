import { expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

await mock.module("@myakiba/auth/server", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "user-1" } }) } },
}));

let ttl = 1800;
const counted: string[] = [];
await mock.module("@myakiba/redis/client", () => ({
  redis: {
    eval: async (_script: string, _keys: number, key: string) => {
      counted.push(key);
      return [121, ttl];
    },
  },
}));

const { rateLimit } = await import("./rate-limit");
const app = new Elysia().use(rateLimit).get("/probe", () => "allowed", {
  rateLimit: "addCommit",
});

test.each([
  { value: 1800, retryAfter: "1800" },
  { value: 0, retryAfter: "3600" },
  { value: -1, retryAfter: "3600" },
])(
  "a rate-limited request with TTL $value preserves the exact 429 response",
  async ({ value, retryAfter }) => {
    ttl = value;
    const response = await app.handle(new Request("http://localhost/probe"));

    expect(response.status).toBe(429);
    expect(await response.text()).toBe(`Rate limit exceeded, try again in ${retryAfter} seconds`);
    expect(Object.fromEntries(response.headers)).toEqual({
      "retry-after": retryAfter,
      "x-ratelimit-limit": "120",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": retryAfter,
    });
  },
);

test("a new X-Forwarded-For on each request counts against the same user", async () => {
  counted.length = 0;
  for (const address of ["198.51.100.1", "198.51.100.2"]) {
    await app.handle(
      new Request("http://localhost/probe", { headers: { "x-forwarded-for": address } }),
    );
  }
  expect(counted).toEqual(["rl:add-commit:user-1", "rl:add-commit:user-1"]);
});
