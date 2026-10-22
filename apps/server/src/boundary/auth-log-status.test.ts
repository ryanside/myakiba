import { expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import * as z from "zod";

const redisStore = new Map<string, string>();
await mock.module("@myakiba/redis/client", () => ({
  redis: {
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    },
    del: async (key: string) => Number(redisStore.delete(key)),
  },
}));

// A static import of evlog/elysia makes test.each throw "bind() called on non-callable".
const { evlog } = await import("evlog/elysia");
const { auth } = await import("@myakiba/auth/server");
const { publicRoutes } = await import("./public-routes");

let drained = Promise.withResolvers<DrainContext>();
initLogger({ silent: true, drain: (context) => drained.resolve(context) });
const app = new Elysia().use(evlog()).use(publicRoutes);

const post = {
  method: "POST",
  body: "{}",
  headers: { "content-type": "application/json", origin: "http://localhost:3001" },
};
const request = (path: string, init: RequestInit) =>
  new Request(`http://localhost:3000${path}`, init);
const plain = (init: RequestInit) => async (path: string) => request(path, init);

async function deniedGoogleCallback(path: string) {
  const signIn = await auth.handler(
    request("/api/auth/sign-in/social", { ...post, body: JSON.stringify({ provider: "google" }) }),
  );
  const { url } = z.object({ url: z.string() }).parse(await signIn.json());
  const state = new URL(url).searchParams.get("state");
  const cookie = signIn.headers.getSetCookie().map((setCookie) => setCookie.split(";")[0]);
  return request(`${path}?state=${state}&error=access_denied`, {
    method: "GET",
    headers: { cookie: cookie.join("; ") },
  });
}

test.each([
  ["GET", "/api/auth/does-not-exist", 404, 0, plain({ method: "GET" })],
  ["POST", "/api/auth/delete-user", 401, 0, plain(post)],
  ["POST", "/api/auth/sign-out", 200, 3, plain(post)],
  ["GET", "/api/auth/callback/google", 302, 1, deniedGoogleCallback],
] as const)(
  "%s %s logs %d and keeps Better Auth's response",
  async (method, path, status, cookies, send) => {
    drained = Promise.withResolvers<DrainContext>();

    const expected = await auth.handler(await send(path));
    const response = await app.handle(await send(path));

    expect(expected.status).toBe(status);
    expect(expected.headers.getSetCookie()).toHaveLength(cookies);
    expect(response.status).toBe(status);
    expect(await response.text()).toBe(await expected.text());
    expect([...response.headers]).toEqual([...expected.headers]);
    const { event } = await drained.promise;
    expect(event).toMatchObject({ method, path, status });
  },
);
