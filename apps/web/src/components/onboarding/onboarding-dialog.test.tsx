import { afterAll, afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

type UserUpdate = {
  readonly username?: string;
  readonly currency?: string;
  readonly dateFormat?: string;
  readonly hasSeenOnboarding?: boolean;
};

const updates: UserUpdate[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url.endsWith("/update-user")) {
      updates.push((await request.json()) as UserUpdate);
      return Response.json({ status: true });
    }
    if (request.url.endsWith("/is-username-available")) return Response.json({ available: true });
    return Response.json(null);
  },
  { preconnect: realFetch.preconnect },
);

const { OnboardingProvider, useOpenOnboarding } = await import("./onboarding-dialog");
const { generateUsername } = await import("@myakiba/contracts/shared/generated-username");

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
  delete (navigator as { language?: string }).language;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

type OnboardingStatus = { hasSeenOnboarding?: boolean };

const GENERATED_USERNAME = generateUsername();

function setBrowserLocale(language: string) {
  Object.defineProperty(navigator, "language", { value: language, configurable: true });
}

async function openDashboard(
  hasSeenOnboarding?: boolean,
  { withAboutCopy = false, username = "collector" } = {},
) {
  const onboarding: OnboardingStatus = {};
  if (hasSeenOnboarding !== undefined) onboarding.hasSeenOnboarding = hasSeenOnboarding;
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: () => ({
      session: {
        user: Object.assign(
          { username, currency: "USD", dateFormat: "MM/DD/YYYY", ...onboarding },
          ...updates,
        ),
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
  const add = createRoute({ getParentRoute: () => app, path: "/add" });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([dashboard, add])]),
    history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Dashboard", hidden: true });
  return router;
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

test("the last step explains picking, then closes onboarding and goes to the Add page", async () => {
  const router = await openDashboard(true);
  fireEvent.click(screen.getByRole("button", { name: "Getting Started" }));
  for (const title of ["Welcome to myakiba.", "Install the myakiba extension."]) {
    await screen.findByRole("dialog", { name: title });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }

  const step = await screen.findByRole("dialog", { name: "Pick your first items." });
  expect(step.textContent).toContain("Pick for myakiba");
  expect(step.textContent).not.toContain("CSV");
  fireEvent.click(screen.getByRole("button", { name: "Get started" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/add"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

async function continueToAddItems() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: "Install the myakiba extension." });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  return screen.findByRole("dialog", { name: "Pick your first items." });
}

function classTokens(element: HTMLElement) {
  return element.className.split(/\s+/);
}

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

function preferences() {
  const step = screen.getByRole("dialog", { name: "Welcome to myakiba." });
  return {
    username: within(step).queryByRole("textbox", { name: "Username" }),
    currency: within(step).getByRole("button", { name: "Currency" }).textContent,
    dateFormat: within(step).getByRole("button", { pressed: true }).textContent,
  };
}

test("an account that chose its username at sign-up is not asked for one", async () => {
  await openDashboard(false);

  expect(preferences().username).toBeNull();
});

test("an account with a generated username is asked to choose one, and saves it", async () => {
  await openDashboard(false, { username: GENERATED_USERNAME });
  const { username } = preferences();
  expect(username).not.toBeNull();
  expect((username as HTMLInputElement).value).toBe("");

  fireEvent.change(username as HTMLInputElement, { target: { value: "collector" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  await screen.findByRole("dialog", { name: "Install the myakiba extension." });
  expect(updates).toEqual([{ username: "collector", hasSeenOnboarding: true }]);
});

test("a new account in a ja-JP browser starts with yen and year-first dates", async () => {
  setBrowserLocale("ja-JP");
  await openDashboard(false);

  expect(preferences().currency).toContain("JPY");
  expect(preferences().dateFormat).toBe("YYYY/MM/DD");

  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() =>
    expect(updates).toEqual([
      { currency: "JPY", dateFormat: "YYYY/MM/DD", hasSeenOnboarding: true },
    ]),
  );
});

test("a new account in an en-GB browser starts with pounds and day-first dates", async () => {
  setBrowserLocale("en-GB");
  await openDashboard(false);

  expect(preferences().currency).toContain("GBP");
  expect(preferences().dateFormat).toBe("DD/MM/YYYY");
});

test("Getting Started shows an onboarded account its saved currency, whatever the locale", async () => {
  setBrowserLocale("ja-JP");
  await openDashboard(true);
  fireEvent.click(screen.getByRole("button", { name: "Getting Started" }));
  await screen.findByRole("dialog", { name: "Welcome to myakiba." });

  expect(preferences().currency).toContain("USD");
  expect(preferences().dateFormat).toBe("MM/DD/YYYY");
});

async function choosePreferences(currency: string, dateFormat: string) {
  fireEvent.click(screen.getByRole("button", { name: "Currency" }));
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(currency, "u") }));
  fireEvent.click(screen.getByRole("button", { name: dateFormat }));
}

test.each([
  ["EUR", "YYYY/MM/DD"],
  ["USD", "MM/DD/YYYY"],
])(
  "%s and %s saved before a reload at the extension step come back, not the locale's guess",
  async (currency, dateFormat) => {
    setBrowserLocale("en-GB");
    await openDashboard(false);
    await choosePreferences(currency, dateFormat);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("dialog", { name: "Install the myakiba extension." });
    const saved = updates.length;

    cleanup();
    await openDashboard(false);
    await screen.findByRole("dialog", { name: "Install the myakiba extension." });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("dialog", { name: "Welcome to myakiba." });

    expect(preferences().currency).toContain(currency);
    expect(preferences().dateFormat).toBe(dateFormat);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("dialog", { name: "Install the myakiba extension." });
    expect(updates.slice(saved)).toEqual([]);
  },
);

async function savePreferencesThenLeave() {
  setBrowserLocale("en-GB");
  await openDashboard(false);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: "Install the myakiba extension." });
  cleanup();
}

test("a new account that saved preferences and left at the extension step reopens there in the same browser", async () => {
  await savePreferencesThenLeave();
  await openDashboard(false);

  expect(
    await screen.findByRole("dialog", { name: "Install the myakiba extension." }),
  ).toBeTruthy();
});

test("a new account that saved preferences and left at the extension step sees no onboarding in another browser", async () => {
  await savePreferencesThenLeave();
  localStorage.clear();
  await openDashboard(false);
  await act(() => Bun.sleep(500));

  expect(screen.queryByRole("dialog")).toBeNull();
});
