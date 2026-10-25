import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import * as z from "zod";
import type { User } from "@/lib/auth-client";

await mock.module("@/lib/auth-redirect-url", () => ({
  getAuthRedirectUrl: (path: string) => `http://localhost:3001${path}`,
}));

const MAC_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari";

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

const session = (id: string, userAgent: string) => ({
  id,
  token: `${id}-token`,
  userId: user.id,
  userAgent,
  ipAddress: "",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

type Server = {
  sessions: ReturnType<typeof session>[];
  current: string;
  devices: "listed" | "needs-fresh-sign-in" | "unavailable";
  /** What the session check answers once the password has changed. */
  checkAfterChange: "ok" | "unavailable";
  changed: boolean;
};

let server: Server;
let pendingDevices: Promise<void> | undefined;

function resetServer(checkAfterChange: Server["checkAfterChange"]) {
  server = {
    sessions: [session("old-session", MAC_FIREFOX), session("phone-session", IPHONE)],
    current: "old-session",
    devices: "listed",
    checkAfterChange,
    changed: false,
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname } = new URL(new Request(input, init).url);
    if (pathname.endsWith("/account-type")) return Response.json({ hasCredentialAccount: true });
    if (pathname.endsWith("/list-accounts")) {
      return Response.json([
        {
          id: "credential-account",
          providerId: "credential",
          accountId: user.id,
          userId: user.id,
          scopes: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
    }
    if (pathname.endsWith("/list-sessions")) {
      await pendingDevices;
      if (server.devices !== "listed") {
        return Response.json(
          {
            code: server.devices === "needs-fresh-sign-in" ? "SESSION_NOT_FRESH" : "UNKNOWN_ERROR",
            message: "Couldn't load your devices",
          },
          { status: 403 },
        );
      }
      return Response.json(server.sessions);
    }
    if (pathname.endsWith("/get-session")) {
      if (server.changed && server.checkAfterChange === "unavailable") {
        return new Response(null, { status: 503 });
      }
      const current = server.sessions.find(({ id }) => id === server.current);
      return Response.json(current ? { session: current, user } : null);
    }
    // Better Auth signs every session out and gives this browser a new one.
    if (pathname.endsWith("/change-password")) {
      const rotated = session("new-session", MAC_FIREFOX);
      server.sessions = [rotated];
      server.current = rotated.id;
      server.changed = true;
      return Response.json({ token: rotated.token, user });
    }
    throw new Error(`Unexpected ${pathname}`);
  },
  { preconnect: realFetch.preconnect },
);

const { Account } = await import("./account");
const { Toaster } = await import("@/components/ui/toast");

afterEach(() => {
  cleanup();
  pendingDevices = undefined;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

function openAccount(location = "/settings") {
  const client = new QueryClient();
  const root = createRootRoute();
  const app = createRoute({ getParentRoute: () => root, id: "(app)" });
  const settings = createRoute({
    getParentRoute: () => app,
    path: "settings",
    validateSearch: z.object({ error: z.string().optional() }),
    component: () => <Account user={user} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([settings])]),
    history: createMemoryHistory({ initialEntries: [location] }),
  });
  render(
    <QueryClientProvider client={client}>
      <Toaster>
        <RouterProvider router={router} />
      </Toaster>
    </QueryClientProvider>,
  );
  return { client, router };
}

async function changePassword() {
  const trigger = await waitFor(() => {
    const button = screen.getByRole("button", { name: "Change password" });
    expect(button.hasAttribute("disabled")).toBe(false);
    return button;
  });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Current password"), {
    target: { value: "old password" },
  });
  fireEvent.change(within(dialog).getByLabelText("New password"), {
    target: { value: "new password" },
  });
  fireEvent.change(within(dialog).getByLabelText("Confirm new password"), {
    target: { value: "new password" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
  expect(await screen.findByText("Password changed")).toBeTruthy();
}

test("after a password change, the new session is this device, with no sign-out", async () => {
  resetServer("ok");
  openAccount();
  await changePassword();

  expect(await screen.findByText("This device")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Sign out of / })).toBeNull();
});

test("when the session can't be checked after a password change, no device offers to sign this one out", async () => {
  resetServer("unavailable");
  openAccount();
  await changePassword();

  expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Sign out of / })).toBeNull();
});

test("a link to devices focuses the list when the pending devices finish loading", async () => {
  resetServer("ok");
  const pending = Promise.withResolvers<undefined>();
  pendingDevices = pending.promise;
  openAccount("/settings#setting-devices");
  await screen.findByLabelText("Loading devices");

  await act(async () => pending.resolve());
  await screen.findByText("This device");
  const devices = document.querySelector("#setting-devices");
  expect(devices).not.toBeNull();
  await waitFor(() => expect(document.activeElement === devices).toBe(true));
});

test("a link to sign out others focuses its row when the pending devices finish loading", async () => {
  resetServer("ok");
  const pending = Promise.withResolvers<undefined>();
  pendingDevices = pending.promise;
  openAccount("/settings#setting-sign-out-others");
  await screen.findByLabelText("Loading devices");

  await act(async () => pending.resolve());
  await screen.findByText("This device");
  const row = document.querySelector("#setting-sign-out-others");
  expect(row).not.toBeNull();
  await waitFor(() => expect(document.activeElement === row).toBe(true));
});

test.each(["needs-fresh-sign-in", "unavailable"] as const)(
  "refreshing targeted devices through %s does not steal focus",
  async (state) => {
    resetServer("ok");
    const { client } = openAccount("/settings#setting-devices");
    await screen.findByText("This device");
    expect(document.activeElement === document.querySelector("#setting-devices")).toBe(true);

    const password = screen.getByRole("button", { name: "Change password" });
    password.focus();
    server.devices = state;
    await act(() => client.invalidateQueries({ queryKey: ["devices"] }));
    if (state === "needs-fresh-sign-in") {
      await screen.findByText("Sign in again to see your devices");
    } else {
      await screen.findByRole("button", { name: "Try again" });
    }
    expect(document.activeElement === password).toBe(true);

    server.devices = "listed";
    await act(() => client.invalidateQueries({ queryKey: ["devices"] }));
    await screen.findByText("This device");
    expect(document.activeElement === password).toBe(true);
  },
);

test("a devices anchor focuses again after its hash is deactivated and reactivated", async () => {
  resetServer("ok");
  const { router } = openAccount("/settings#setting-devices");
  await screen.findByText("This device");
  expect(document.activeElement === document.querySelector("#setting-devices")).toBe(true);

  await act(() => router.navigate({ to: "/settings" }));
  screen.getByRole("button", { name: "Change password" }).focus();
  await act(() => router.navigate({ to: "/settings", hash: "setting-devices" }));
  expect(document.activeElement === document.querySelector("#setting-devices")).toBe(true);
});
