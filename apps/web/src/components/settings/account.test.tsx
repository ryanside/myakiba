import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { User } from "@/lib/auth-client";

await mock.module("@/lib/auth-redirect-url", () => ({
  getAuthRedirectUrl: (path: string) => `http://localhost:3001${path}`,
}));

// The changelog collects its entries with Vite's import.meta.glob, which bun cannot run.
await mock.module("@/lib/changelog", () => ({
  changelogEntries: [],
  formatChangelogDate: (value: string) => value,
  loadChangelogEntry: () => null,
}));

const UNREACHABLE = [
  "/send-verification-email",
  "/link-social",
  "/unlink-account",
  "/revoke-session",
  "/revoke-other-sessions",
];

let isGoogleLinked = false;

const account = (providerId: string) => ({
  id: `${providerId}-account`,
  providerId,
  accountId: `${providerId}-id`,
  userId: "collector",
  scopes: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const session = (id: string, userAgent: string) => ({
  id,
  token: `${id}-token`,
  userId: "collector",
  userAgent,
  ipAddress: "",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const thisSession = session(
  "this-session",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0",
);
const otherSession = session(
  "other-session",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari",
);

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname } = new URL(new Request(input, init).url);
    if (UNREACHABLE.some((path) => pathname.endsWith(path))) {
      throw new TypeError("Failed to fetch");
    }
    if (pathname.endsWith("/account-type")) return Response.json({ hasCredentialAccount: true });
    if (pathname.endsWith("/list-accounts")) {
      return Response.json(
        isGoogleLinked ? [account("credential"), account("google")] : [account("credential")],
      );
    }
    if (pathname.endsWith("/list-sessions")) {
      return Response.json([thisSession, otherSession]);
    }
    if (pathname.endsWith("/get-session")) return Response.json({ session: thisSession, user });
    throw new Error(`Unexpected ${pathname}`);
  },
  { preconnect: realFetch.preconnect },
);

const { Route: SettingsRoute } = await import("@/routes/(app)/settings");
const { Toaster } = await import("@/components/ui/toast");

afterEach(() => {
  cleanup();
  isGoogleLinked = false;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const user = {
  id: "collector",
  name: "collector",
  username: "collector",
  email: "collector@example.com",
  emailVerified: false,
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  hasSeenOnboarding: true,
  banned: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User;

function openAccount() {
  const root = createRootRoute();
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: () => ({ session: { user, session: thisSession } }),
  });
  const settings = createRoute({
    getParentRoute: () => app,
    path: "settings",
    validateSearch: SettingsRoute.options.validateSearch,
    component: SettingsRoute.options.component,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([settings])]),
    history: createMemoryHistory({ initialEntries: ["/settings?section=account"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>
        <RouterProvider router={router} />
      </Toaster>
    </QueryClientProvider>,
  );
}

test.each([
  ["Resend verification email", "Resend verification email", false],
  ["Connect", "Connect", false],
  ["Disconnect", "Disconnect", true],
  ["Sign out of a device", /^Sign out of /, false],
  ["Sign out others", "Sign out others", false],
] as const)(
  "%s says it failed and can be tried again when the server is unreachable",
  async (_action, name, googleLinked) => {
    isGoogleLinked = googleLinked;
    openAccount();
    const button = await screen.findByRole("button", { name });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));

    fireEvent.click(button);

    expect(await screen.findByText(/^Couldn't/)).toBeTruthy();
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  },
);
