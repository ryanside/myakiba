import { expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { initLogger } from "evlog";

initLogger({ enabled: false });

const lookups: string[] = [];
await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        lookups.push(id ?? "anonymous");
        return id ? { user: { id }, session: { id: `session-${id}` } } : null;
      },
    },
  },
}));

const { privateApi } = await import("@/boundary/private-api");

const app = new Elysia().use(
  privateApi("/probe").get("/me", ({ user }) => user.id, { auth: true }),
);
const me = async (user: string) => {
  const response = await app.handle(
    new Request("http://localhost/probe/me", { headers: { "x-test-user": user } }),
  );
  return response.text();
};

test("a route inside privateApi that also sets auth: true looks the session up once", async () => {
  lookups.length = 0;

  expect(await me("user-1")).toBe("user-1");
  expect(lookups).toEqual(["user-1"]);
});

test("two requests never share a session", async () => {
  lookups.length = 0;

  expect([await me("user-1"), await me("user-2")]).toEqual(["user-1", "user-2"]);
  expect(lookups).toEqual(["user-1", "user-2"]);
});
