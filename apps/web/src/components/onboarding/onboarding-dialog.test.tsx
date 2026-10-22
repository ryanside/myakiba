import { afterAll, afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

const updates: unknown[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.endsWith("/update-user")) {
      updates.push(await request.json());
      return Response.json({ status: true });
    }
    return Response.json(null);
  },
  { preconnect: realFetch.preconnect },
);

const { OnboardingDialog } = await import("./onboarding-dialog");

afterEach(() => {
  cleanup();
  localStorage.removeItem("myakiba:onboarding-v2");
  updates.length = 0;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

type OnboardingStatus = { hasSeenOnboarding?: boolean };

async function openDashboard(hasSeenOnboarding?: boolean) {
  const onboarding: OnboardingStatus = {};
  if (hasSeenOnboarding !== undefined) onboarding.hasSeenOnboarding = hasSeenOnboarding;
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: () => ({
      session: {
        user: {
          username: "collector",
          currency: "USD",
          dateFormat: "MM/DD/YYYY",
          ...onboarding,
        },
      },
    }),
    component: () => (
      <>
        <h1>Dashboard</h1>
        <OnboardingDialog renderTrigger={<button type="button">Getting Started</button>} />
      </>
    ),
  });
  const dashboard = createRoute({ getParentRoute: () => app, path: "/dashboard" });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Dashboard" });
}

test("an onboarded account on a new browser keeps the welcome dialog closed", async () => {
  await openDashboard(true);
  await act(() => Bun.sleep(500));

  expect(
    screen.queryByRole("dialog") !== null,
    "the welcome dialog opened for an already onboarded account",
  ).toBe(false);
  expect(updates).toEqual([]);
});

test("an account signed in before the deploy keeps the welcome dialog closed", async () => {
  await openDashboard();
  await act(() => Bun.sleep(500));

  expect(
    screen.queryByRole("dialog") !== null,
    "the welcome dialog opened for an account signed in before the deploy",
  ).toBe(false);
  expect(updates).toEqual([]);
});

test("a new account sees the welcome dialog and saves that it has seen onboarding", async () => {
  await openDashboard(false);

  expect(await screen.findByRole("dialog", { name: "Welcome to myakiba." })).toBeTruthy();
  await waitFor(() => expect(updates).toEqual([{ hasSeenOnboarding: true }]));
});

test("Getting Started resumes the saved step from legacy local storage", async () => {
  localStorage.setItem(
    "myakiba:onboarding-v2",
    JSON.stringify({ step: 1, completed: false, hasSeen: true }),
  );
  await openDashboard(true);
  fireEvent.click(screen.getByRole("button", { name: "Getting Started" }));

  expect(
    await screen.findByRole("dialog", { name: "Set your username, currency, and date format." }),
  ).toBeTruthy();
});
