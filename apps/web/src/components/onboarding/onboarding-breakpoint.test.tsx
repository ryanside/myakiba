import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { signedInSession } from "../../../test/session";
import { stubFetch } from "../../../test/app-route";

const { Route: appRoute } = await import("@/routes/(app)/route");

const DESKTOP_WIDTH = 1440;
const PHONE_WIDTH = 390;

function resizeWindow(width: number) {
  act(() => {
    window.happyDOM.setInnerWidth(width);
  });
}

afterEach(() => {
  cleanup();
  window.happyDOM.setInnerWidth(1024);
});

async function openAppShellAsNewAccount() {
  stubFetch(() => Response.json(null));
  const session = signedInSession({ user: { hasSeenOnboarding: false } });
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: () => ({ session }),
    component: appRoute.options.component,
  });
  const dashboard = createRoute({
    getParentRoute: () => app,
    path: "/dashboard",
    component: () => <h1>Dashboard</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Dashboard", hidden: true });
}

async function continueToAddItems() {
  await screen.findByRole("dialog", { name: "Welcome to myakiba." });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: "Set your username, currency, and date format." });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: "Install the myakiba extension." });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: "Pick your first items." });
}

test("the onboarding dialog stays open on its step when the window narrows to a phone and widens back", async () => {
  window.happyDOM.setInnerWidth(DESKTOP_WIDTH);
  await openAppShellAsNewAccount();
  await continueToAddItems();

  resizeWindow(PHONE_WIDTH);
  expect(
    screen.queryByRole("dialog", { name: "Pick your first items." }),
    "the dialog closed or lost its step at phone width",
  ).not.toBeNull();

  resizeWindow(DESKTOP_WIDTH);
  expect(
    screen.queryByRole("dialog", { name: "Pick your first items." }),
    "the dialog closed or lost its step back at desktop width",
  ).not.toBeNull();
});

test("a new account on a phone sees the welcome dialog with the sidebar closed", async () => {
  window.happyDOM.setInnerWidth(PHONE_WIDTH);
  await openAppShellAsNewAccount();

  expect(await screen.findByRole("dialog", { name: "Welcome to myakiba." })).toBeTruthy();
});
