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

const { OnboardingProvider, useOpenOnboarding } = await import("./onboarding-dialog");

function OpenOnboardingButton({ label }: { readonly label: string }) {
  const openOnboarding = useOpenOnboarding();
  return (
    <button type="button" onClick={openOnboarding}>
      {label}
    </button>
  );
}

afterEach(() => {
  cleanup();
  localStorage.removeItem("myakiba:onboarding-v2");
  updates.length = 0;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

type OnboardingStatus = { hasSeenOnboarding?: boolean };

async function openDashboard(hasSeenOnboarding?: boolean, { withAboutCopy = false } = {}) {
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
      <OnboardingProvider>
        <h1>Dashboard</h1>
        <OpenOnboardingButton label="Getting Started" />
        {withAboutCopy ? <OpenOnboardingButton label="Open Getting Started" /> : null}
      </OnboardingProvider>
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
  await screen.findByRole("heading", { name: "Dashboard", hidden: true });
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
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  await waitFor(() => expect(updates).toEqual([{ hasSeenOnboarding: true }]));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("a new account that opens Getting Started right away saves that it has seen onboarding", async () => {
  await openDashboard(false);
  fireEvent.click(screen.getByRole("button", { name: "Getting Started", hidden: true }));
  fireEvent.click(await screen.findByRole("button", { name: "Close" }));

  await waitFor(() => expect(updates).toEqual([{ hasSeenOnboarding: true }]));
});

test("a new account that dismisses the welcome with Escape saves that it has seen onboarding", async () => {
  await openDashboard(false);
  fireEvent.keyDown(await screen.findByRole("dialog", { name: "Welcome to myakiba." }), {
    key: "Escape",
  });

  await waitFor(() => expect(updates).toEqual([{ hasSeenOnboarding: true }]));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("a new account sees one welcome dialog while Settings also offers Getting Started", async () => {
  await openDashboard(false, { withAboutCopy: true });
  await screen.findByRole("dialog", { name: "Welcome to myakiba." });
  await act(() => Bun.sleep(100));

  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

test("Settings' Getting Started button opens the welcome for an onboarded account", async () => {
  await openDashboard(true, { withAboutCopy: true });
  fireEvent.click(screen.getByRole("button", { name: "Open Getting Started" }));

  expect(await screen.findByRole("dialog", { name: "Welcome to myakiba." })).toBeTruthy();
});

test("a new account sees the welcome as soon as the dashboard renders", async () => {
  await openDashboard(false);

  expect(screen.getByRole("dialog", { name: "Welcome to myakiba." })).toBeTruthy();
});

test("Getting Started opens at the welcome step even with a step left in local storage", async () => {
  localStorage.setItem(
    "myakiba:onboarding-v2",
    JSON.stringify({ step: 1, completed: false, hasSeen: true }),
  );
  await openDashboard(true);
  fireEvent.click(screen.getByRole("button", { name: "Getting Started" }));

  expect(await screen.findByRole("dialog", { name: "Welcome to myakiba." })).toBeTruthy();
});

async function continueToAddItems() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: "Set your username, currency, and date format." });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  return screen.findByRole("dialog", { name: "Bring in your items." });
}

function classTokens(element: HTMLElement) {
  return element.className.split(/\s+/);
}

test("the add items step points to the + button in the top bar, not the sidebar", async () => {
  await openDashboard(false);
  const dialog = await continueToAddItems();

  expect(dialog.textContent).toContain("the + button at the top right");
  expect(dialog.textContent).not.toContain("sidebar");
});

test("every onboarding footer button is the standard button height", async () => {
  await openDashboard(false);
  const welcomeFooter = ["Close", "Continue"].map((name) => screen.getByRole("button", { name }));
  for (const button of welcomeFooter) {
    expect(classTokens(button), `${button.textContent} on the welcome step`).toContain("h-8");
  }

  await continueToAddItems();
  for (const name of ["Close", "Back", "Get started"]) {
    expect(classTokens(screen.getByRole("button", { name })), `${name} on the last step`).toContain(
      "h-8",
    );
  }
});

test("the add items option cards take a card corner, not a pill", async () => {
  await openDashboard(false);
  await continueToAddItems();

  for (const name of [/Add to collection/, /Create order/, /Import MyFigureCollection CSV/]) {
    const tokens = classTokens(screen.getByRole("button", { name }));
    expect(tokens, `${name} is still a pill`).not.toContain("rounded-full");
    expect(tokens).toContain("rounded-xl");
  }
});
