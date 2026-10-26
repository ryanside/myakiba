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
import { addDays, format } from "date-fns";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@/lib/auth-client";

const user = {
  id: "collector",
  name: "collector",
  username: "collector",
  email: "collector@example.com",
  emailVerified: true,
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  hasSeenOnboarding: true,
  banned: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User;

const SAVED = { currency: "USD", dateFormat: "MM/DD/YYYY" };
let server = { ...SAVED };
const savedChanges: unknown[] = [];
let holdNextSave = false;
let releaseHeldSave = () => {};

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    if (pathname.endsWith("/update-user")) {
      const changes: object = await request.json();
      savedChanges.push(changes);
      if (holdNextSave) {
        holdNextSave = false;
        await new Promise<void>((resolve) => {
          releaseHeldSave = resolve;
        });
      }
      server = { ...server, ...changes };
      return Response.json({ status: true });
    }
    if (pathname.endsWith("/get-session")) return Response.json(null);
    throw new Error(`Unexpected ${request.url}`);
  },
  { preconnect: realFetch.preconnect },
);

let session: User = user;
const sessionListeners = new Set<() => void>();

function setSession(next: User) {
  session = next;
  for (const listener of sessionListeners) listener();
}

/** The session reaches the route after the server has saved, as Better Auth refetches it. */
function sessionCatchesUp() {
  act(() => setSession({ ...user, ...server }));
}

const { Preferences } = await import("./preferences");

afterEach(() => {
  cleanup();
  server = { ...SAVED };
  savedChanges.length = 0;
  holdNextSave = false;
  session = user;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

let renderAgain = () => {};

/** Settings as the route shows it, with a session that still holds the formats it loaded with. */
function SettingsScreen() {
  const [, setRenders] = useState(0);
  useEffect(() => {
    renderAgain = () => setRenders((renders) => renders + 1);
  }, []);
  const current = useSyncExternalStore(
    (listener) => {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
    () => session,
  );
  return <Preferences user={current} />;
}

function renderPreferences() {
  const root = createRootRoute({ component: Outlet });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/settings", component: SettingsScreen }),
      createRoute({
        getParentRoute: () => root,
        path: "/dashboard",
        component: () => <p>Dashboard</p>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";

async function chooseCurrency(code: string) {
  fireEvent.click(screen.getByRole("button", { name: "Display currency" }));
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(`^${code}`) }));
}

test("the preview shows an example order in the chosen formats before they are saved", async () => {
  renderPreferences();
  const release = addDays(new Date(), 52);
  const order = await screen.findByRole("figure", { name: "Example order" });
  expect(within(order).getByText(format(release, "MM/dd/yyyy"))).toBeDefined();
  expect(within(order).getByText("$184.50")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "YYYY/MM/DD" }));

  expect(await within(order).findByText(format(release, "yyyy/MM/dd"))).toBeDefined();

  await chooseCurrency("EUR");

  expect(await within(order).findByText(/^184,50\s€$/)).toBeDefined();
  expect(savedChanges).toEqual([]);
});

// After a save the button shows its success state for 1.5 s before the label returns.
const saveSettles = () =>
  screen.findByRole("button", { name: "Save preferences" }, { timeout: 3000 });

test("Save preferences sends both changed formats in one update", async () => {
  renderPreferences();
  await screen.findByRole("button", { name: "YYYY/MM/DD" });

  await chooseCurrency("EUR");
  fireEvent.click(screen.getByRole("button", { name: "YYYY/MM/DD" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

  await waitFor(() =>
    expect(savedChanges).toEqual([{ currency: "EUR", dateFormat: "YYYY/MM/DD" }]),
  );
});

test("after Save the form keeps the saved formats while the session catches up", async () => {
  renderPreferences();
  await screen.findByRole("button", { name: "YYYY/MM/DD" });

  fireEvent.click(screen.getByRole("button", { name: "YYYY/MM/DD" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(savedChanges).toHaveLength(1));
  await saveSettles();
  act(() => renderAgain());

  expect(screen.getByRole("button", { name: "YYYY/MM/DD" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(
    screen.getByRole("button", { name: "Save preferences" }).hasAttribute("disabled"),
  ).toBeTrue();
});

test("a format saved elsewhere replaces the one shown, and Save sends only what changed here", async () => {
  renderPreferences();
  await screen.findByRole("button", { name: "YYYY/MM/DD" });

  act(() => setSession({ ...user, dateFormat: "YYYY/MM/DD" }));

  expect(pressed("YYYY/MM/DD")).toBeTrue();
  expect(
    screen.getByRole("button", { name: "Save preferences" }).hasAttribute("disabled"),
  ).toBeTrue();

  await chooseCurrency("EUR");
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

  await waitFor(() => expect(savedChanges).toEqual([{ currency: "EUR" }]));
});

test("a format saved elsewhere keeps an unsaved edit to the other format", async () => {
  renderPreferences();
  await screen.findByRole("button", { name: "YYYY/MM/DD" });

  fireEvent.click(screen.getByRole("button", { name: "DD/MM/YYYY" }));
  act(() => setSession({ ...user, currency: "EUR" }));

  expect(pressed("DD/MM/YYYY")).toBeTrue();
  expect(screen.getByRole("button", { name: "Display currency" }).textContent).toStartWith("EUR");

  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

  await waitFor(() => expect(savedChanges).toEqual([{ dateFormat: "DD/MM/YYYY" }]));
});

test("the formats refuse edits while a save is in flight", async () => {
  renderPreferences();
  await screen.findByRole("button", { name: "YYYY/MM/DD" });

  holdNextSave = true;
  fireEvent.click(screen.getByRole("button", { name: "DD/MM/YYYY" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await screen.findByRole("button", { busy: true });

  fireEvent.click(screen.getByRole("button", { name: "YYYY/MM/DD" }));
  expect(pressed("DD/MM/YYYY")).toBeTrue();
  expect(
    screen.getByRole("button", { name: "Display currency" }).hasAttribute("disabled"),
  ).toBeTrue();

  act(() => releaseHeldSave());
  await saveSettles();
  sessionCatchesUp();

  expect(pressed("DD/MM/YYYY")).toBeTrue();
  expect(
    screen.getByRole("button", { name: "Save preferences" }).hasAttribute("disabled"),
  ).toBeTrue();
  expect(savedChanges).toEqual([{ dateFormat: "DD/MM/YYYY" }]);
});

test("a save still in flight after leaving Settings and coming back blocks a second save until it lands", async () => {
  const router = renderPreferences();
  await screen.findByRole("button", { name: "YYYY/MM/DD" });

  holdNextSave = true;
  fireEvent.click(screen.getByRole("button", { name: "DD/MM/YYYY" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await screen.findByRole("button", { busy: true });

  await act(() => router.navigate({ to: "/dashboard" }));
  await screen.findByText("Dashboard");
  await act(() => router.navigate({ to: "/settings" }));
  await screen.findByRole("button", { name: "YYYY/MM/DD" });

  fireEvent.click(screen.getByRole("button", { name: "YYYY/MM/DD" }));
  fireEvent.click(screen.getByRole("button", { busy: true }));

  act(() => releaseHeldSave());
  await saveSettles();
  sessionCatchesUp();
  expect(pressed("DD/MM/YYYY")).toBeTrue();

  fireEvent.click(screen.getByRole("button", { name: "YYYY/MM/DD" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));

  await waitFor(() => expect(server).toEqual({ currency: "USD", dateFormat: "YYYY/MM/DD" }));
  expect(savedChanges).toEqual([{ dateFormat: "DD/MM/YYYY" }, { dateFormat: "YYYY/MM/DD" }]);
});
