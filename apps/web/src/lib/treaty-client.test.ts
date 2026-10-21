import { afterAll, expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";

let sessionRequests = 0;
let apiRequests = 0;
let signedIn = true;
let sessionStatus = 200;
let held: Promise<null> | null = null;
const session = {
  session: {
    id: "revoked-session",
    token: "test-token",
    userId: "revoked-user",
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: "revoked-user",
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
};

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes("/api/auth/get-session")) {
      apiRequests++;
      return new Response("Unauthorized", { status: 401 });
    }
    sessionRequests++;
    if (held) await held;
    if (sessionStatus !== 200)
      return Response.json({ message: "Unavailable" }, { status: sessionStatus });
    return signedIn
      ? Response.json(session)
      : Response.json({ message: "Unauthorized" }, { status: 401 });
  },
  { preconnect: realFetch.preconnect },
);

const { authClient } = await import("@/lib/auth-client");
const { app } = await import("@/lib/treaty-client");

afterAll(() => {
  globalThis.fetch = realFetch;
});

test("a burst of API 401s checks the session once and signs a revoked session out", async () => {
  const authState = renderHook(() => authClient.useSession());
  await waitFor(() => expect(authState.result.current.data?.user.id).toBe("revoked-user"));

  signedIn = false;
  sessionRequests = 0;
  const check = Promise.withResolvers<null>();
  held = check.promise;
  const answers = Promise.all([
    app.api.dashboard.get(),
    app.api.dashboard.get(),
    app.api.settings["account-type"].get(),
  ]);
  await waitFor(() => expect(apiRequests).toBe(3));
  await act(async () => {
    await Bun.sleep(0);
    check.resolve(null);
    await answers;
  });

  expect(sessionRequests).toBe(1);
  expect(authState.result.current.data).toBeNull();
  for (const { error } of await answers) expect(error?.status).toBe(401);
});

test("API 401s after a confirmed sign-out send no session checks", async () => {
  signedIn = false;
  held = null;
  const authState = renderHook(() => authClient.useSession());
  await act(() => authState.result.current.refetch());
  expect(authState.result.current).toMatchObject({ data: null, isPending: false });

  sessionRequests = 0;
  for (const _call of [1, 2, 3]) await app.api.dashboard.get();
  expect(sessionRequests).toBe(0);
});

test("an API 401 rechecks a session whose initial check was unavailable", async () => {
  held = null;
  signedIn = true;
  sessionStatus = 503;
  const authState = renderHook(() => authClient.useSession());
  await act(() => authState.result.current.refetch());
  expect(authState.result.current).toMatchObject({
    data: null,
    isPending: false,
    error: { status: 503 },
  });

  sessionStatus = 200;
  sessionRequests = 0;
  await act(() => app.api.dashboard.get());
  expect(sessionRequests).toBe(1);
  expect(authState.result.current.data?.user.name).toBe("Collector");
});
