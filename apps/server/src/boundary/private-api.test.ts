import { describe, expect, mock, test } from "bun:test";
import { Elysia, status } from "elysia";
import { initLogger } from "evlog";
import path from "node:path";

const SENTINEL = "auth-macro-ran";

initLogger({ enabled: false });

// Elysia validates input before the real macro resolves, so this fake answers from transform, which runs first.
await mock.module(path.join(import.meta.dir, "../middleware/better-auth.ts"), () => ({
  betterAuth: new Elysia({ name: "better-auth" }).macro({
    auth: {
      transform() {
        throw status(401, SENTINEL);
      },
    },
  }),
}));

const { routes } = await import("../routes");
const { publicRoutes } = await import("./public-routes");
const { privateApi } = await import("./private-api");

const nameOf = (route: { readonly method: string; readonly path: string }) =>
  `${route.method} ${route.path}`;
const publicNames = publicRoutes.routes.map(nameOf);

const anonymousRequest = ({ method, path: routePath }: { method: string; path: string }) => {
  const url = `http://localhost${routePath.replaceAll(/:[^/]+/g, "x")}`;
  if (["GET", "DELETE", "HEAD"].includes(method)) return new Request(url, { method });
  return new Request(url, { method, body: "{}", headers: { "content-type": "application/json" } });
};

describe("every route outside public-routes.ts needs a session", () => {
  test("public-routes.ts holds the health check, the build id and the auth handler", () => {
    expect(publicNames).toEqual([
      "GET /api/auth/*",
      "POST /api/auth/*",
      "GET /health",
      "GET /api/version",
    ]);
  });

  test("the route table was discovered", () => {
    expect(routes.routes.length).toBeGreaterThan(70);
  });

  test.each(routes.routes.filter((route) => !publicNames.includes(nameOf(route))).map(nameOf))(
    "%s",
    async (name) => {
      const route = routes.routes.find((candidate) => nameOf(candidate) === name);
      if (!route) throw new Error(`${name} is not mounted`);
      const response = await routes.handle(anonymousRequest(route));

      expect({ status: response.status, body: await response.text() }).toEqual({
        status: 401,
        body: SENTINEL,
      });
    },
  );

  test("a privateApi handler that never reads the user still needs a session", async () => {
    const guarded = privateApi("/probe").get("/ping", () => "pong");
    const open = new Elysia({ prefix: "/probe" }).get("/ping", () => "pong");

    const answer = async (app: { handle: (request: Request) => Promise<Response> }) => {
      const response = await app.handle(new Request("http://localhost/probe/ping"));
      return { status: response.status, body: await response.text() };
    };

    expect(await answer(guarded)).toEqual({ status: 401, body: SENTINEL });
    expect(await answer(open)).toEqual({ status: 200, body: "pong" });
  });
});
