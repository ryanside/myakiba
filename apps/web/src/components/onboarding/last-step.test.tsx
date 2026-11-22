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
import { EXTENSION_STOPPED_TEXT } from "@/lib/pick-failure";
import { delegatingBridge, fakeExtension, fakePick } from "../../../test/fake-extension";
import type { FakePick } from "../../../test/fake-extension";
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
const TAKE_NEVER_ANSWERS_MS = 60_000;

function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window, { picksAnswerMs: TAKE_NEVER_ANSWERS_MS });
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

function takeRequests(): readonly string[] {
  return extension.posted
    .filter(({ message }) => message.request.type === "take-picks")
    .map(({ message }) => message.requestId);
}

function answerTake(requestId: string | undefined, picks: readonly FakePick[]) {
  if (requestId === undefined) throw new Error("No take to answer");
  act(() => {
    extension.emit(requestId, { type: "picks", picks });
  });
}

const settle = () => act(() => Bun.sleep(50));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("with no extension, the last step links to the store listing", async () => {
  loadExtension({ installed: false });
  await openLastStep();

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

test("an extension too old for this page asks for an update and takes no picks", async () => {
  loadExtension({ protocols: { min: 0, max: 0 }, picks: [fakePick(1)] });
  await openLastStep();

  await waitFor(() => expect(lastStepText()).toContain("Update needed"));
  expect(lastStepText()).toContain("How to update it");
  expect(takeRequests().length).toBe(0);
  expect(finishLabel()).toBe("Get started");
});

test("an extension that stopped says to reload the page for the picks", async () => {
  loadExtension({ picks: [fakePick(1)] });
  extension.stopTakes(true);
  await openLastStep();

  await waitFor(() => expect(lastStepText()).toContain(EXTENSION_STOPPED_TEXT));
  expect(finishLabel()).toBe("Get started");
});

test("with no picks yet, the last step says how to pick one", async () => {
  loadExtension({ picks: [] });
  await openLastStep();

  await waitFor(() => expect(lastStepText()).toContain("No picks yet"));
  expect(lastStepText()).toContain(
    "Click Pick for myakiba on any MyFigureCollection item and it lands on the Add page.",
  );
  expect(finishLabel()).toBe("Get started");
});

test("one pick waiting goes to the Add page, closes onboarding and keeps the pick", async () => {
  loadExtension({ picks: [fakePick(1)] });
  const router = await openLastStep();

  await waitFor(() => expect(lastStepText()).toContain("1 pick waiting"));
  expect(finishLabel()).toBe("Go to Add");
  fireEvent.click(screen.getByRole("button", { name: "Go to Add" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/add"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(extension.picks().length).toBe(1);
  expect(extension.acknowledged.length).toBe(0);
});

test("three picks read as 3 picks waiting", async () => {
  loadExtension({ picks: [fakePick(1), fakePick(2), fakePick(3)] });
  await openLastStep();

  await waitFor(() => expect(lastStepText()).toContain("3 picks waiting"));
  expect(finishLabel()).toBe("Go to Add");
});

test("a pick made in another tab counts when this tab is focused again", async () => {
  loadExtension({ picks: [fakePick(1)] });
  await openLastStep();
  await waitFor(() => expect(lastStepText()).toContain("1 pick waiting"));

  extension.setPicks([fakePick(1), fakePick(2)]);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });

  await waitFor(() => expect(lastStepText()).toContain("2 picks waiting"));
});

test("a take answered after a newer take was sent does not replace the newer count", async () => {
  loadExtension({ answersPicks: false });
  await openLastStep();
  await waitFor(() => expect(takeRequests().length).toBe(1));
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(takeRequests().length).toBe(2));
  const [older, newer] = takeRequests();

  answerTake(newer, [fakePick(1), fakePick(2)]);
  await waitFor(() => expect(lastStepText()).toContain("2 picks waiting"));
  answerTake(older, [fakePick(1), fakePick(2), fakePick(3), fakePick(4), fakePick(5)]);
  await settle();

  expect(lastStepText()).toContain("2 picks waiting");
});

test("a take answered after the last step was left does not show when it opens again", async () => {
  loadExtension({ answersPicks: false });
  await openLastStep();
  await waitFor(() => expect(takeRequests().length).toBe(1));
  const [left] = takeRequests();

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  await screen.findByRole("dialog", { name: "Install the myakiba extension." });
  answerTake(left, [fakePick(1), fakePick(2), fakePick(3), fakePick(4), fakePick(5)]);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: LAST_STEP });
  await settle();

  expect(lastStepText()).not.toContain("waiting");
  expect(finishLabel()).toBe("Get started");
  await waitFor(() => expect(takeRequests().length).toBe(2));
  answerTake(takeRequests()[1], [fakePick(1)]);
  await waitFor(() => expect(lastStepText()).toContain("1 pick waiting"));
});
