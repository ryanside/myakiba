import { afterAll, afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { RouterAppContext } from "@/routes/__root";
import type { Session } from "@/lib/session";

const session = {
  session: {
    id: "navigation-session",
    token: "test-token",
    userId: "navigation-user",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "navigation-user",
    name: "Collector",
    username: "collector",
    email: "collector@example.com",
    emailVerified: true,
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    createdAt: new Date(),
    updatedAt: new Date(),
    banned: false,
    role: "user",
  },
} satisfies NonNullable<Session>;

let sessionRequests = 0;
const realFetch = globalThis.fetch;
const realDecode = Image.prototype.decode;
Image.prototype.decode = async () => {};
globalThis.fetch = Object.assign(
  async () => {
    sessionRequests++;
    if (sessionRequests > 4)
      return Response.json({ message: "Too many requests" }, { status: 429 });
    return Response.json(session);
  },
  { preconnect: realFetch.preconnect },
);
const { Route: appRoute } = await import("@/routes/(app)/route");
const { Route: loginRoute } = await import("@/routes/(auth)/login");
const { Route: signupRoute } = await import("@/routes/(auth)/signup");

afterEach(() => {
  cleanup();
  sessionRequests = 0;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  Image.prototype.decode = realDecode;
});

function makeRouter(path: string, current: Session = session) {
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: appRoute.options.beforeLoad,
    component: Outlet,
  });
  const dashboard = createRoute({
    getParentRoute: () => app,
    path: "/dashboard",
    component: () => <h1>Dashboard</h1>,
  });
  const orders = createRoute({
    getParentRoute: () => app,
    path: "/orders",
    component: () => <h1>Orders</h1>,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    validateSearch: loginRoute.options.validateSearch,
    beforeLoad: loginRoute.options.beforeLoad,
    component: () => <h1>Login</h1>,
  });
  const signup = createRoute({
    getParentRoute: () => root,
    path: "/signup",
    beforeLoad: signupRoute.options.beforeLoad,
    component: () => <h1>Sign up</h1>,
  });
  return createRouter({
    routeTree: root.addChildren([app.addChildren([dashboard, orders]), login, signup]),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { readSession: async () => ({ session: current, unavailable: false }) },
    defaultPendingMinMs: 0,
  });
}

test("sidebar preloads and navigation keep a valid session without exhausting session checks", async () => {
  const router = makeRouter("/dashboard");
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Dashboard" });
  for (const to of [
    "/orders",
    "/dashboard",
    "/orders",
    "/dashboard",
    "/orders",
    "/dashboard",
  ] as const) {
    await act(async () => {
      await router.preloadRoute({ to });
      await router.navigate({ to });
    });
    expect(router.state.location.pathname).toBe(to);
  }
  expect(sessionRequests).toBe(0);
});

test("the auth pages read the same session as the app instead of checking it again", async () => {
  const router = makeRouter("/login", null);
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Login" });
  await act(() => router.navigate({ to: "/signup" }));
  expect(await screen.findByRole("heading", { name: "Sign up" })).toBeTruthy();
  expect(router.state.location.pathname).toBe("/signup");
  expect(sessionRequests).toBe(0);
});
