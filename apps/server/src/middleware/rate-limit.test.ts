import { expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

await mock.module("@myakiba/auth/server", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "user-1" } }) } },
}));

let ttl = 1800;
await mock.module("@myakiba/redis/client", () => ({
  redis: { eval: async () => [121, ttl] },
}));

const { rateLimit } = await import("./rate-limit");
const app = new Elysia().use(rateLimit).get("/probe", () => "allowed", {
  rateLimit: "mfcLookup",
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
