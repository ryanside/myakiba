import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  getRouteApi,
  Outlet,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as z from "zod";
import type { RouterAppContext } from "@/routes/__root";
import { createSessionSource } from "@/lib/session";
import type { Session, SessionSource } from "@/lib/session";

await mock.module("@/lib/page-background", () => ({
  downloadPageBackground: () => {},
  preparePageBackground: () => {},
  getPageBackground: () => {},
}));

let sessionRequests = 0;
let responseStatus = 200;
let sessionNetworkError = false;
let sessionResponses = 0;
let staleCheck: Promise<Response> | null = null;
let endFailure: "network" | "server" | "password" | "expired" | "no-message" | null = null;
let signedIn = true;
let requestLimit = Infinity;
let held: Promise<null> | null = null;
let endingSession = false;
let deletingAccount = false;
let dashboardRenders = 0;
let shellRenders = 0;
const session = {
  session: {
    id: "navigation-session",
    token: "test-token",
    userId: "navigation-user",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "navigation-user",
    name: "Collector",
    username: "collector",
    email: "collector@example.com",
    emailVerified: true,
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    createdAt: new Date(),
    updatedAt: new Date(),
    banned: false,
    role: "user",
  },
} satisfies NonNullable<Session>;
const otherSession = {
  session: { ...session.session, id: "other-session", userId: "other-user" },
  user: { ...session.user, id: "other-user", name: "Other collector", username: "other" },
} satisfies NonNullable<Session>;
let account: NonNullable<Session> = session;
let ownerLoads = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/account-type"))
      return Response.json({ hasCredentialAccount: endFailure === "password" });
    if (new URL(url).pathname.endsWith("/orders")) {
      return Response.json({
        items: [],
        totalCount: 0,
        totalSpent: 0,
        activeOrders: 0,
        unpaidCosts: 0,
      });
    }
    if (url.endsWith("/update-user")) {
      const changes = z
        .object({ currency: z.string(), dateFormat: z.string() })
        .partial()
        .parse(await new Request(input, init).json());
      account = { ...account, user: { ...account.user, ...changes } };
      return Response.json({ status: true });
    }
    if (url.endsWith("/sign-out") || url.endsWith("/delete-user")) {
      if (endFailure === "network") throw new TypeError("Failed to fetch");
      if (endFailure === "server") {
        return Response.json({ message: "Please try again" }, { status: 503 });
      }
      if (endFailure === "password") {
        expect(await new Request(input, init).json()).toEqual({ password: "wrong-password" });
        return Response.json(
          { code: "INVALID_PASSWORD", message: "Invalid password" },
          { status: 400 },
        );
      }
      if (endFailure === "expired") {
        return Response.json(
          {
            code: "SESSION_EXPIRED",
            message: "Session expired. Re-authenticate to perform this action.",
          },
          { status: 400 },
        );
      }
      if (endFailure === "no-message") return Response.json({}, { status: 400 });
      signedIn = false;
      endingSession = true;
      return Response.json({ success: true });
    }
    sessionRequests++;
    if (staleCheck) {
      const response = staleCheck;
      staleCheck = null;
      return response;
    }
    if (held) await held;
    sessionResponses++;
    if (sessionNetworkError) throw new TypeError("Failed to fetch");
    if (sessionRequests > requestLimit || responseStatus !== 200) {
      return Response.json(
        { message: "Session check failed" },
        { status: responseStatus === 200 ? 429 : responseStatus },
      );
    }
    return Response.json(signedIn ? account : null);
  },
  { preconnect: realFetch.preconnect },
);

const { DeleteAccount } = await import("@/components/settings/delete-account");
const { default: UserMenu } = await import("@/components/sidebar/user-menu");
const { Route: loginRoute } = await import("@/routes/(auth)/login");
const { Route: appRoute } = await import("@/routes/(app)/route");
const { authClient } = await import("@/lib/auth-client");
const { Toaster } = await import("@/components/ui/toast");
const { Preferences } = await import("@/components/settings/preferences");
const { useUserPreferences } = await import("@/hooks/use-user-preferences");
const sessionAtom = authClient.$store.atoms.session;
if (!sessionAtom) throw new Error("Missing session atom");
const listen = sessionAtom.listen.bind(sessionAtom);
const pageListeners: (() => void)[] = [];
// Each test starts a new page, including its page-lifetime session listeners.
const listenSpy = spyOn(sessionAtom, "listen").mockImplementation((listener) => {
  const unsubscribe = listen(listener);
  pageListeners.push(unsubscribe);
  return unsubscribe;
});
const { AuthRouterProvider } = await import("./auth-router-provider");
const { rootedRead, useRead } = await import("@/data/client");

afterEach(() => {
  cleanup();
  for (const unsubscribe of pageListeners.splice(0)) unsubscribe();
  sessionNetworkError = false;
  sessionResponses = 0;
  staleCheck = null;
  endFailure = null;
  sessionRequests = 0;
  responseStatus = 200;
  signedIn = true;
  requestLimit = Infinity;
  held = null;
  account = session;
  ownerLoads = 0;
  endingSession = false;
  deletingAccount = false;
  dashboardRenders = 0;
  shellRenders = 0;
});
afterAll(() => {
  listenSpy.mockRestore();
  globalThis.fetch = realFetch;
});

const ownerKey = ["dashboard", "owner"] as const;
const owner = rootedRead("dashboard", {
  key: () => ownerKey,
  load: async () => {
    ownerLoads++;
    if (!signedIn) throw new Error("Unauthorized");
    return account.user.name;
  },
  staleTime: 5 * 60 * 1000,
});

function AppShell() {
  shellRenders++;
  return (
    <div data-testid="app-shell">
      <Outlet />
    </div>
  );
}

function Dashboard() {
  dashboardRenders++;
  const { data } = useRead(owner);
  return (
    <>
      <h1>Dashboard</h1>
      {deletingAccount ? <DeleteAccount /> : <UserMenu session={session} />}
      {data && <p>{`${data}'s collection`}</p>}
    </>
  );
}

const appRouteApi = getRouteApi("/(app)");

function Settings() {
  const { user } = appRouteApi.useRouteContext().session;
  const { dateFormat } = useUserPreferences();
  return (
    <>
      <p>{`Dates show as ${dateFormat}`}</p>
      <Preferences user={user} />
    </>
  );
}

function renderApp(router: ReturnType<typeof makeRouter>, sessions: SessionSource) {
  const queryClient = new QueryClient();
  render(<AuthRouterProvider router={router} sessions={sessions} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <Toaster>{children}</Toaster>
      </QueryClientProvider>
    ),
  });
  return queryClient;
}

function makeRouter(sessions: SessionSource, path = "/dashboard", checkSignedIn = false) {
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: appRoute.options.beforeLoad,
    errorComponent: appRoute.options.errorComponent,
    component: AppShell,
  });
  const dashboard = createRoute({
    getParentRoute: () => app,
    path: "/dashboard",
    component: Dashboard,
  });
  const orders = createRoute({
    getParentRoute: () => app,
    path: "/orders",
    component: () => <h1>Orders</h1>,
  });
  const settings = createRoute({
    getParentRoute: () => app,
    path: "/settings",
    component: Settings,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    validateSearch: loginRoute.options.validateSearch,
    beforeLoad: checkSignedIn ? loginRoute.options.beforeLoad : undefined,
    component: () => <h1>Login</h1>,
  });
  return createRouter({
    routeTree: root.addChildren([app.addChildren([dashboard, orders, settings]), login]),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { readSession: sessions.read },
    defaultPendingMinMs: 0,
  });
}

async function openApp(checkSignedIn = false, path = "/dashboard") {
  const authState = renderHook(() => authClient.useSession());
  const status = responseStatus;
  const authenticated = signedIn;
  responseStatus = 200;
  signedIn = false;
  await act(() => authState.result.current.refetch());
  responseStatus = status;
  signedIn = authenticated;
  sessionRequests = 0;
  await act(() => authState.result.current.refetch());
  const sessions = createSessionSource();
  const router = makeRouter(sessions, path, checkSignedIn);
  const queryClient = renderApp(router, sessions);
  return { router, queryClient, refetch: () => authState.result.current.refetch(), authState };
}

test("the session provider answers sidebar preloads and navigation without new session checks", async () => {
  requestLimit = 4;
  const { router } = await openApp();
  await screen.findByRole("heading", { name: "Dashboard" });

  const initialRequests = sessionRequests;
  for (const to of [
    "/orders",
    "/dashboard",
    "/orders",
    "/dashboard",
    "/orders",
    "/dashboard",
  ] as const) {
    await act(async () => {
      await router.preloadRoute({ to });
      await router.navigate({ to });
    });
    expect(router.state.location.pathname).toBe(to);
  }
  expect(sessionRequests).toBe(initialRequests);
});

test("a page renders without an interstitial while the first session check is in flight", async () => {
  const authState = renderHook(() => authClient.useSession());
  signedIn = false;
  await act(() => authState.result.current.refetch());
  signedIn = true;
  const check = Promise.withResolvers<null>();
  held = check.promise;
  let refetching = Promise.resolve();
  act(() => {
    refetching = authState.result.current.refetch();
  });
  expect(authState.result.current.isPending).toBe(true);

  const sessions = createSessionSource();
  const loginRouter = makeRouter(sessions, "/login");
  renderApp(loginRouter, sessions);
  expect(await screen.findByRole("heading", { name: "Login" })).toBeTruthy();
  cleanup();

  const appRouter = makeRouter(sessions);
  renderApp(appRouter, sessions);
  expect(document.body.textContent).toBe("");
  expect(screen.queryByRole("status")).toBeNull();

  check.resolve(null);
  await act(() => refetching);
  expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
});

test.each([429, 503])(
  "an initial session-check %s shows a retry without sending the user to login",
  async (status) => {
    responseStatus = status;
    const { router } = await openApp();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't check your session");
    expect(screen.queryByRole("heading", { name: "Login" })).toBeNull();
    expect(router.state.location.pathname).toBe("/dashboard");

    responseStatus = 200;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  },
);

test("a throttled refresh preserves the active session during navigation", async () => {
  const { router, refetch } = await openApp();
  await screen.findByRole("heading", { name: "Dashboard" });
  responseStatus = 429;
  await act(refetch);
  await act(() => router.navigate({ to: "/orders" }));
  expect(await screen.findByRole("heading", { name: "Orders" })).toBeTruthy();
  expect(router.state.location.pathname).toBe("/orders");
});

test.each([200, 401])(
  "a confirmed signed-out session (%s) redirects protected pages to login",
  async (status) => {
    const { router, refetch } = await openApp();
    await screen.findByRole("heading", { name: "Dashboard" });
    signedIn = false;
    responseStatus = status;
    await act(refetch);
    expect(await screen.findByRole("heading", { name: "Login" })).toBeTruthy();
    await act(() => router.navigate({ to: "/orders" }));
    expect(router.state.location.pathname).toBe("/login");
  },
);

test("signing in as another account in place shows that account's data, not the cached data", async () => {
  const { refetch } = await openApp();
  expect(await screen.findByText("Collector's collection")).toBeTruthy();
  account = otherSession;
  await act(refetch);
  expect(await screen.findByText("Other collector's collection")).toBeTruthy();
  expect(screen.queryByText("Collector's collection")).toBeNull();
});

test("a session that ends drops the signed-out account's cached data", async () => {
  const { queryClient, refetch } = await openApp();
  await screen.findByText("Collector's collection");
  signedIn = false;
  await act(refetch);
  await screen.findByRole("heading", { name: "Login" });
  expect(queryClient.getQueryData<string>(ownerKey)).toBeUndefined();
});

test("saved preferences reach the route context without a page reload", async () => {
  await openApp(false, "/settings");
  await screen.findByText("Dates show as MM/DD/YYYY");
  const check = Promise.withResolvers<null>();
  held = check.promise;
  const requests = sessionRequests;

  fireEvent.click(screen.getByRole("button", { name: "DD/MM/YYYY" }));
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await screen.findByText("Preferences updated successfully");
  await waitFor(() => expect(sessionRequests).toBeGreaterThan(requests));
  check.resolve(null);

  expect(await screen.findByText("Dates show as DD/MM/YYYY")).toBeTruthy();
});

test.each([
  ["a same-account refresh", 200],
  ["a throttled refresh", 429],
])("%s keeps the cached data", async (_refresh, status) => {
  const { queryClient, refetch } = await openApp();
  await screen.findByText("Collector's collection");
  responseStatus = status;
  await act(refetch);
  expect(ownerLoads).toBe(1);
  expect(queryClient.getQueryData<string>(ownerKey)).toBe("Collector");
  expect(screen.getByText("Collector's collection")).toBeTruthy();
});

async function endCurrentSession() {
  if (deletingAccount) {
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete Account" }).hasAttribute("disabled")).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    if (endFailure === "password") {
      fireEvent.change(await screen.findByLabelText("Password"), {
        target: { value: "wrong-password" },
      });
    } else {
      fireEvent.change(await screen.findByRole("textbox", { name: "Confirmation" }), {
        target: { value: "delete my account" },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Delete Account Permanently" }));
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign Out" }));
  }
}

test.each(["signing out", "deleting an account"])(
  "%s settles before the follow-up session check, then stays on login without a dashboard bounce",
  async (action) => {
    deletingAccount = action === "deleting an account";
    const { router } = await openApp(true);
    await screen.findByRole("heading", { name: "Dashboard" });
    await screen.findByText("Collector's collection");
    const check = Promise.withResolvers<null>();
    held = check.promise;
    const requests = sessionRequests;
    const visited: string[] = [];
    const unsubscribe = router.history.subscribe(({ location }) => visited.push(location.pathname));

    await endCurrentSession();
    await screen.findByText(
      deletingAccount ? "Account deleted successfully" : "Signed out successfully",
    );
    await waitFor(() => expect(endingSession).toBe(true));
    await waitFor(() => expect(sessionRequests).toBeGreaterThan(requests));
    await screen.findByRole("heading", { name: "Login" });
    check.resolve(null);
    await waitFor(() => expect(screen.queryByTestId("app-shell")).toBeNull());
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
    expect(screen.queryByText("Collector's collection")).toBeNull();
    unsubscribe();
    expect(visited).toEqual(["/login"]);
  },
);

test.each([
  ["signing out with 503", false, 503],
  ["signing out with 429", false, 429],
  ["signing out with a network error", false, "network"],
  ["deleting an account with 503", true, 503],
  ["deleting an account with 429", true, 429],
  ["deleting an account with a network error", true, "network"],
] as const)(
  "%s settles locally after a failed follow-up session check",
  async (_scenario, deleteAccount, status) => {
    deletingAccount = deleteAccount;
    const { router, queryClient } = await openApp(true);
    await screen.findByText("Collector's collection");
    const check = Promise.withResolvers<null>();
    held = check.promise;
    responseStatus = status === "network" ? 200 : status;
    sessionNetworkError = status === "network";
    const responses = sessionResponses;
    const requests = sessionRequests;
    const visited: string[] = [];
    const unsubscribe = router.history.subscribe(({ location }) => visited.push(location.pathname));

    try {
      await endCurrentSession();
      await screen.findByText(
        deletingAccount ? "Account deleted successfully" : "Signed out successfully",
      );
      await waitFor(() => expect(endingSession).toBe(true));
      await waitFor(() => expect(sessionRequests).toBeGreaterThan(requests));
      await screen.findByRole("heading", { name: "Login" });
      expect(router.state.location.pathname).toBe("/login");
      expect(screen.queryByTestId("app-shell")).toBeNull();
      expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
      expect(queryClient.getQueryData<string>(ownerKey)).toBeUndefined();
      const renders = { shell: shellRenders, dashboard: dashboardRenders };
      check.resolve(null);
      await waitFor(() => expect(sessionResponses).toBeGreaterThan(responses));
      await act(() => router.invalidate());
      expect(renders).toEqual({ shell: shellRenders, dashboard: dashboardRenders });
      expect(visited).toEqual(["/login"]);
      await act(() => router.navigate({ to: "/dashboard" }));
      await screen.findByRole("heading", { name: "Login" });
      expect(router.state.location.pathname).toBe("/login");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(queryClient.getQueryData<string>(ownerKey)).toBeUndefined();
    } finally {
      check.resolve(null);
      unsubscribe();
    }
  },
);

test.each(["signing out", "deleting an account"])(
  "%s stays final when an in-flight check restores the old session before a failed follow-up",
  async (action) => {
    deletingAccount = action === "deleting an account";
    const { router, queryClient, refetch } = await openApp(true);
    await screen.findByText("Collector's collection");
    const stale = Promise.withResolvers<Response>();
    staleCheck = stale.promise;
    let checking = Promise.resolve();
    act(() => {
      checking = refetch();
    });
    await waitFor(() => expect(staleCheck).toBeNull());
    const followUp = Promise.withResolvers<null>();
    held = followUp.promise;
    responseStatus = 503;
    const responses = sessionResponses;
    const requests = sessionRequests;
    let renders: { shell: number; dashboard: number } | undefined;
    const stop = sessionAtom.listen((value) => {
      if (endingSession && !value.data && !value.error && !value.isPending && !renders) {
        renders = { shell: shellRenders, dashboard: dashboardRenders };
        stale.resolve(Response.json(session));
      }
    });
    try {
      await endCurrentSession();
      await screen.findByText(
        deletingAccount ? "Account deleted successfully" : "Signed out successfully",
      );
      await act(() => checking);
      await waitFor(() => expect(sessionRequests).toBeGreaterThan(requests));
      await screen.findByRole("heading", { name: "Login" });
      expect(renders).toBeDefined();
      expect(renders).toEqual({ shell: shellRenders, dashboard: dashboardRenders });
      expect(queryClient.getQueryData<string>(ownerKey)).toBeUndefined();
      followUp.resolve(null);
      await waitFor(() => expect(sessionResponses).toBeGreaterThan(responses));
      await act(() => router.invalidate());
      expect(renders).toEqual({ shell: shellRenders, dashboard: dashboardRenders });
      expect(screen.queryByTestId("app-shell")).toBeNull();
      await act(() => router.navigate({ to: "/dashboard" }));
      await screen.findByRole("heading", { name: "Login" });
      expect(router.state.location.pathname).toBe("/login");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(queryClient.getQueryData<string>(ownerKey)).toBeUndefined();
    } finally {
      stale.resolve(Response.json(session));
      followUp.resolve(null);
      stop();
    }
  },
);

test.each([
  ["signing out with a network error", false, "network"],
  ["signing out with a server error", false, "server"],
  ["deleting an account with a network error", true, "network"],
  ["deleting an account with a server error", true, "server"],
  ["deleting an account with an invalid password", true, "password"],
  ["deleting an account with an expired session", true, "expired"],
  ["deleting an account with no error message", true, "no-message"],
  ["signing out with no error message", false, "no-message"],
] as const)(
  "%s reports the failure and keeps the session",
  async (_action, deleteAccount, failure) => {
    deletingAccount = deleteAccount;
    endFailure = failure;
    const { router, queryClient } = await openApp(true);
    await screen.findByText("Collector's collection");
    await endCurrentSession();
    const messages = {
      password: "Invalid password",
      expired: "Sign in again to delete your account",
      server: "Please try again",
      network: deleteAccount
        ? "Couldn't delete account. Try again."
        : "Couldn't sign out. Try again.",
      "no-message": deleteAccount
        ? "Couldn't delete account. Try again."
        : "Couldn't sign out. Try again.",
    };
    await screen.findByText(messages[failure]);
    expect(screen.queryByText("Signed out successfully")).toBeNull();
    expect(screen.queryByText("Account deleted successfully")).toBeNull();
    expect(router.state.location.pathname).toBe("/dashboard");
    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(queryClient.getQueryData<string>(ownerKey)).toBe("Collector");
    expect(signedIn).toBe(true);
  },
);
