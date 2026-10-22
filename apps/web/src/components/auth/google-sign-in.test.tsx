import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/toast";
import type { RouterAppContext } from "@/routes/__root";

await mock.module("@marsidev/react-turnstile", () => ({ Turnstile: () => null }));

const consentURL = "https://accounts.google.com/o/oauth2/auth?client_id=myakiba";
const loginURL = "http://localhost:3001/login";
const dashboardURL = "http://localhost:3001/dashboard";
const initialURL = window.location.href;
const realFetch = globalThis.fetch;
const consent = () => Response.json({ url: consentURL, redirect: true });
let respond = consent;
const requests: { url: string; body: unknown }[] = [];
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, body: await request.json() });
    return respond();
  },
  { preconnect: realFetch.preconnect },
);
const { default: SignInForm } = await import("./sign-in-form");

const navigations: string[] = [];
const record = (url: string | URL) => navigations.push(String(url));
const hrefOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.location), "href");

function recordNavigations() {
  Object.defineProperties(window.location, {
    href: { configurable: true, get: () => hrefOf?.get?.call(window.location), set: record },
    assign: { configurable: true, value: record },
    replace: { configurable: true, value: record },
  });
}

function stopRecordingNavigations() {
  for (const key of ["href", "assign", "replace"]) {
    Reflect.deleteProperty(window.location, key);
  }
  navigations.length = 0;
}

afterEach(() => {
  cleanup();
  stopRecordingNavigations();
  respond = consent;
  requests.length = 0;
  window.location.href = initialURL;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function renderLogin() {
  window.location.href = loginURL;
  recordNavigations();
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <SignInForm redirectTo="/dashboard" />,
  });
  const dashboard = createRoute({
    getParentRoute: () => root,
    path: "/dashboard",
    component: () => <h1>Dashboard</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([login, dashboard]),
    history: createMemoryHistory({ initialEntries: ["/login"] }),
    context: { readSession: async () => ({ session: null, unavailable: false }) },
    defaultPendingMinMs: 0,
  });
  render(
    <Toaster>
      <RouterProvider router={router} />
    </Toaster>,
  );
  const button = await screen.findByRole("button", { name: "Continue with Google" });
  return { router, button };
}

test("Google sign-in opens consent without navigating through the signed-out app", async () => {
  const { router, button } = await renderLogin();
  fireEvent.click(button);
  await waitFor(() => expect(navigations).toContain(consentURL));
  expect(navigations).toEqual([consentURL]);
  expect(router.state.location.pathname).toBe("/login");
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toEndWith("/sign-in/social");
  expect(requests[0]?.body).toMatchObject({ provider: "google", callbackURL: dashboardURL });
});

test("a failed Google sign-in shows the server's error and stays on login", async () => {
  respond = () => Response.json({ message: "Google sign-in is unavailable" }, { status: 503 });
  const { router, button } = await renderLogin();
  fireEvent.click(button);
  expect(await screen.findByText("Google sign-in is unavailable")).toBeDefined();
  expect(navigations).toEqual([]);
  expect(router.state.location.pathname).toBe("/login");
});
