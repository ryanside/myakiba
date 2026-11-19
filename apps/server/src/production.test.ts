import { afterAll, expect, mock, test } from "bun:test";
import { initLogger } from "evlog";

const store = new Map<string, string>();
await mock.module("@myakiba/redis/client", () => ({
  redis: {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => store.set(key, value),
    del: async (key: string) => store.delete(key),
    eval: async (_script: string, _keys: number, key: string) => {
      const count = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(count));
      return count;
    },
  },
}));

const saved = { NODE_ENV: process.env.NODE_ENV, CORS_ORIGIN: process.env.CORS_ORIGIN };
process.env.NODE_ENV = "production";
process.env.CORS_ORIGIN = "https://myakiba.test";
afterAll(() => Object.assign(process.env, saved));

initLogger({ enabled: false });
const { createApp } = await import("./app");
const app = createApp({ drain: undefined, authDocs: undefined });

test.each([
  "/openapi",
  "/openapi/json",
  "/api/auth/reference",
  "/api/auth/open-api/generate-schema",
])("production answers 404 for the API docs at %s", async (path) => {
  // A docs client asks for JSON. A request that takes HTML gets the web app, which serves no docs either.
  const response = await app.handle(
    new Request(`http://localhost${path}`, { headers: { accept: "application/json" } }),
  );
  expect(response.status).toBe(404);
});
