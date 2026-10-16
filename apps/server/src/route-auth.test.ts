import { describe, expect, mock, test } from "bun:test";
import { Elysia, status } from "elysia";
import { initLogger } from "evlog";
import path from "node:path";

const PUBLIC_ROUTES = new Set<string>();
const SENTINEL = "auth-macro-ran";

initLogger({ enabled: false });

// Elysia validates params, query and body before the real macro's resolve runs, so an
// anonymous request would get 422 on most routes. The fake throws from transform, which runs first.
mock.module(path.join(import.meta.dir, "middleware/better-auth.ts"), () => ({
  betterAuth: new Elysia({ name: "better-auth" }).macro({
    auth: {
      transform() {
        throw status(401, SENTINEL);
      },
    },
  }),
}));

const routerFiles = [...new Bun.Glob("routers/*/index.ts").scanSync(import.meta.dir)].toSorted();
const routers = await Promise.all(routerFiles.map((file) => import(`./${file}`)));
const app = new Elysia({ prefix: "/api" });
for (const router of routers) app.use(router.default);
const routes = app.routes.map(({ method, path: routePath }) => ({
  name: `${method} ${routePath}`,
  method,
  routePath,
}));

const anonymousRequest = ({ method, routePath }: (typeof routes)[number]) => {
  const url = `http://localhost${routePath.replaceAll(/:[^/]+/g, "x")}`;
  if (["GET", "DELETE", "HEAD"].includes(method)) return new Request(url, { method });
  return new Request(url, { method, body: "{}", headers: { "content-type": "application/json" } });
};

describe("every API route requires a session unless it is listed as public", () => {
  test("the route table was discovered", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  test.each(
    routes
      .filter((route) => !PUBLIC_ROUTES.has(route.name))
      .map((route) => [route.name, route] as const),
  )("%s", async (name, route) => {
    const response = await app.handle(anonymousRequest(route));

    expect({ route: name, status: response.status, body: await response.text() }).toEqual({
      route: name,
      status: 401,
      body: SENTINEL,
    });
  });
});
