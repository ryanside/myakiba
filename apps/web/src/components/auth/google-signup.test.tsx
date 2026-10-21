import { afterAll, afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { RouterAppContext } from "@/routes/__root";

const consentURL = "https://accounts.google.com/o/oauth2/auth?client_id=myakiba";
const initialURL = window.location.href;
const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(async () => Response.json({ url: consentURL, redirect: true }), {
  preconnect: realFetch.preconnect,
});
const { default: SignUpForm } = await import("./sign-up-form");
const { Route: appRoute } = await import("@/routes/(app)/route");

afterEach(() => {
  cleanup();
  window.location.href = initialURL;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

test("Google signup opens consent without navigating through the signed-out app", async () => {
  window.location.href = "http://localhost:3001/signup";
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const signup = createRoute({
    getParentRoute: () => root,
    path: "/signup",
    component: SignUpForm,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <h1>Login</h1>,
  });
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
  const router = createRouter({
    routeTree: root.addChildren([signup, login, app.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: ["/signup"] }),
    context: { readSession: async () => ({ session: null, unavailable: false }) },
    defaultPendingMinMs: 0,
  });
  render(<RouterProvider router={router} />);
  const button = await screen.findByRole("button", { name: "Continue with Google" });
  const visited: string[] = [];
  const unsubscribe = router.history.subscribe(({ location }) => visited.push(location.pathname));
  try {
    fireEvent.click(button);
    await waitFor(() => expect(window.location.href).toBe(consentURL));
    expect(visited).toEqual([]);
    expect(router.state.location.pathname).toBe("/signup");
  } finally {
    unsubscribe();
  }
});
