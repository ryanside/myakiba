import { afterEach, expect, mock, setDefaultTimeout, test } from "bun:test";
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { delegatingBridge, fakeExtension, fakePick } from "../../../test/fake-extension";
import {
  LISTING_URLS,
  SUPPORTED_BROWSERS,
  browseWith,
  listIn,
} from "../../../test/extension-browser";

const [CHROME] = SUPPORTED_BROWSERS;
browseWith(CHROME.userAgent);
listIn(CHROME.store);

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const { OnboardingProvider, useOpenOnboarding } = await import("./onboarding-dialog");

const LAST_STEP = "Pick your first items.";

function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

function holdExtensionCheck(): () => Promise<null> {
  const held = bridge;
  const released = Promise.withResolvers<null>();
  const started = Promise.withResolvers<null>();
  bridge = {
    ...held,
    probe: async () => {
      await released.promise;
      const status = held.probe();
      started.resolve(null);
      return status;
    },
  };
  return () => {
    released.resolve(null);
    return started.promise;
  };
}

function GettingStartedButton() {
  const openOnboarding = useOpenOnboarding();
  return (
    <button type="button" onClick={openOnboarding}>
      Getting Started
    </button>
  );
}

async function openLastStep() {
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
          hasSeenOnboarding: true,
        },
      },
    }),
    component: () => (
      <OnboardingProvider>
        <h1>Dashboard</h1>
        <GettingStartedButton />
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
  fireEvent.click(screen.getByRole("button", { name: "Getting Started" }));
  for (const title of ["Welcome to myakiba.", "Install the myakiba extension."]) {
    await screen.findByRole("dialog", { name: title });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }
  await screen.findByRole("dialog", { name: LAST_STEP });
  return router;
}

function lastStepText(): string {
  return screen.queryByRole("dialog", { name: LAST_STEP })?.textContent ?? "";
}

function finishLabel(): string {
  return screen.getAllByRole("button").at(-1)?.textContent ?? "";
}

const PICK_HOW_TO =
  "Click Pick for myakiba on any MyFigureCollection item and it lands on the Add page.";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("the last step says nothing until the extension answers, then links a missing one to its store listing", async () => {
  loadExtension({ installed: false });
  const startCheck = holdExtensionCheck();
  await openLastStep();
  await startCheck();

  expect(lastStepText()).not.toContain("Install the myakiba extension to pick items");
  expect(lastStepText()).not.toContain(PICK_HOW_TO);
  await waitFor(() =>
    expect(lastStepText()).toContain("Install the myakiba extension to pick items"),
  );
  expect(
    screen
      .getByRole("link", { name: "Install from the Chrome Web Store (opens in a new tab)" })
      .getAttribute("href"),
  ).toBe(LISTING_URLS.chromeWebStore);
  expect(finishLabel()).toBe("Get started");
});

test("an extension too old for this page asks for an update", async () => {
  loadExtension({ protocols: { min: 0, max: 0 } });
  await openLastStep();

  await waitFor(() => expect(lastStepText()).toContain("Update needed"));
  expect(lastStepText()).toContain("How to update it");
  expect(lastStepText()).not.toContain(PICK_HOW_TO);
  expect(finishLabel()).toBe("Get started");
});

test("an installed extension says how to pick, and Get started closes onboarding on the Add page", async () => {
  loadExtension({ picks: [fakePick(1)] });
  const router = await openLastStep();

  await waitFor(() => expect(lastStepText()).toContain(PICK_HOW_TO));
  expect(lastStepText()).not.toContain("Install the myakiba extension");
  fireEvent.click(screen.getByRole("button", { name: "Get started" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/add"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("onboarding never asks the extension for its picks, which only the Add page collects", async () => {
  loadExtension({ picks: [fakePick(1), fakePick(2)] });
  await openLastStep();
  await waitFor(() => expect(bridge.status().kind).toBe("ready"));

  act(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(() => Bun.sleep(50));

  expect(extension.takes()).toBe(0);
  expect(extension.picks().length).toBe(2);
});
