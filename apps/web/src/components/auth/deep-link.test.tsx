import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { RouterAppContext } from "@/routes/__root";
import { answerAuth, refuse, resetAuthAnswers, type } from "../../../test/better-auth";
import { Toaster } from "@/components/ui/toast";
import { PassingTurnstile } from "../../../test/turnstile";

await mock.module("@marsidev/react-turnstile", () => ({ Turnstile: PassingTurnstile }));
const { Route: appRoute } = await import("@/routes/(app)/route");
const { Route: loginRoute } = await import("@/routes/(auth)/login");
const { Route: signupRoute } = await import("@/routes/(auth)/signup");

window.location.href = "http://localhost:3001/login";

afterEach(() => {
  cleanup();
  resetAuthAnswers();
});

async function open(
  path: string,
  readSession: RouterAppContext["readSession"] = async () => ({
    session: null,
    unavailable: false,
  }),
) {
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: appRoute.options.beforeLoad,
    component: Outlet,
  });
  const pages = ["/add", "/orders", "/dashboard"].map((page) =>
    createRoute({ getParentRoute: () => app, path: page }),
  );
  Object.assign(loginRoute.options, {
    getParentRoute: () => root,
    id: "/(auth)/login",
    path: "/login",
  });
  Object.assign(signupRoute.options, {
    getParentRoute: () => root,
    id: "/(auth)/signup",
    path: "/signup",
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren(pages), loginRoute, signupRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { readSession },
    defaultPendingMinMs: 0,
  });
  await act(() => router.load());
  render(
    <Toaster>
      <RouterProvider router={router} />
    </Toaster>,
  );
  return router;
}

test("signing in restores a protected deep link's query and hash exactly", async () => {
  const assign = spyOn(window.location, "assign").mockImplementation(() => {});
  answerAuth(() => Response.json({ redirect: false, token: "token", user: { id: "collector" } }));
  const destinations = [
    "/add?to=collection",
    "/add?from=mfc",
    "/add?item=123&to=collection#details",
    "/orders?search=a%26b+c&status=ordered#items",
  ];
  try {
    for (const destination of destinations) {
      const router = await open(destination);
      expect(router.state.location.pathname).toBe("/login");
      expect(router.state.location.search.redirect).toBe(destination);
      type("Email", "collector@example.com");
      type("Password", "correct horse");
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() =>
        expect(assign).toHaveBeenLastCalledWith(`http://localhost:3001${destination}`),
      );
      cleanup();
    }
  } finally {
    assign.mockRestore();
  }
});

test("registering from a protected deep link preserves its email verification destination", async () => {
  const destination = "/add?from=mfc&to=collection#details";
  const requests = answerAuth(({ path }) =>
    Response.json(path === "/is-username-available" ? { available: true } : { token: null }),
  );
  const router = await open(destination);
  fireEvent.click(screen.getByRole("link", { name: "Create an account" }));
  await screen.findByLabelText("Username");
  expect(router.state.location.search.redirect).toBe(destination);
  const login = screen.getByRole("link", { name: "Sign in" });
  expect(
    new URL(login.getAttribute("href") ?? "", window.location.origin).searchParams.get("redirect"),
  ).toBe(destination);
  type("Username", "collector");
  type("Email", "collector@example.com");
  type("Password", "correct horse");
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
  await screen.findByRole("heading", { name: "Verify your email" });
  expect(requests.find(({ path }) => path === "/sign-up/email")?.body).toMatchObject({
    callbackURL: `http://localhost:3001${destination}`,
  });
  expect(router.state.location.search.redirect).toBe(destination);
  fireEvent.click(screen.getByRole("link", { name: "Back to Login" }));
  await screen.findByLabelText("Password");
  expect(router.state.location.search.redirect).toBe(destination);
});

test("the verification email sent at sign-in returns to the deep link", async () => {
  const destination = "/add?from=mfc&to=collection#details";
  const requests = answerAuth(() => refuse(403, "Forbidden"));
  await open(destination);
  type("Email", "collector@example.com");
  type("Password", "correct horse");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(requests.find(({ path }) => path === "/sign-in/email")?.body).toMatchObject({
      callbackURL: `http://localhost:3001${destination}`,
    }),
  );
});

test("auth forms refuse external and non-relative return destinations", async () => {
  const assign = spyOn(window.location, "assign").mockImplementation(() => {});
  answerAuth(() => Response.json({ redirect: false, token: "token", user: { id: "collector" } }));
  try {
    for (const [destination, landing] of [
      ["//evil.example", "/dashboard"],
      ["/\\evil.example", "/dashboard"],
      ["https://evil.example", "/dashboard"],
      ["dashboard", "/dashboard"],
      ["data:text/html,evil", "/dashboard"],
      ["/%2F/evil.example", "/%2F/evil.example"],
    ] as const) {
      assign.mockClear();
      await open(`/login?redirect=${encodeURIComponent(destination)}`);
      type("Email", "collector@example.com");
      type("Password", "correct horse");
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() =>
        expect(assign).toHaveBeenLastCalledWith(`http://localhost:3001${landing}`),
      );
      cleanup();
    }
  } finally {
    assign.mockRestore();
  }
});

test("signed-in login and signup visitors keep relative destinations and refuse external ones", async () => {
  answerAuth(() => Response.json({ session: { id: "session" }, user: { id: "collector" } }));
  const { authClient } = await import("@/lib/auth-client");
  const readSession: RouterAppContext["readSession"] = async () => {
    const { data } = await authClient.getSession();
    return { session: data, unavailable: false };
  };
  for (const page of ["login", "signup"]) {
    for (const destination of [
      "/add?to=collection&item=123#details",
      "//evil.example",
      "https://evil.example",
      "dashboard",
      "data:text/html,evil",
    ]) {
      const router = await open(
        `/${page}?redirect=${encodeURIComponent(destination)}`,
        readSession,
      );
      expect(router.state.location.href).toBe(
        destination.startsWith("/add") ? destination : "/dashboard",
      );
      cleanup();
    }
  }
});

test("Google login and signup callbacks preserve safe deep links", async () => {
  for (const page of ["login", "signup"]) {
    for (const destination of ["/add?from=mfc&to=collection#details", "//evil.example"]) {
      const requests = answerAuth(() => Response.json({ redirect: false }));
      await open(`/${page}?redirect=${encodeURIComponent(destination)}`);
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
      await waitFor(() =>
        expect(requests.find(({ path }) => path === "/sign-in/social")?.body).toMatchObject({
          callbackURL: `http://localhost:3001${destination.startsWith("/add") ? destination : "/dashboard"}`,
        }),
      );
      cleanup();
    }
  }
});
