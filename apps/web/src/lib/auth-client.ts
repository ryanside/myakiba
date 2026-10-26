import { createAuthClient } from "better-auth/react";
import { adminClient, usernameClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@myakiba/auth/server";
import { env } from "@myakiba/env/web";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [usernameClient(), adminClient(), inferAdditionalFields<typeof auth>()],
});

export type User = typeof authClient.$Infer.Session.user;

const sessionAtom = authClient.$store.atoms.session;
if (!sessionAtom)
  throw new Error("Better Auth's client has no session store at $store.atoms.session");
type SessionState = ReturnType<typeof authClient.useSession>;
const sessionStore: {
  get: () => SessionState;
  set: (value: SessionState) => void;
  listen: (listener: (value: SessionState) => void) => () => void;
} = sessionAtom;

export function classifySession({
  data,
  error,
  isPending,
}: Pick<SessionState, "data" | "error" | "isPending">):
  | "pending"
  | "signed-in"
  | "signed-out"
  | "unavailable" {
  if (isPending) return "pending";
  if (data) return "signed-in";
  if (error && error.status !== 401) return "unavailable";
  return "signed-out";
}

/**
 * Better Auth answers a failed request with `{ error }`, but throws when the request never
 * reaches the server. This answers that case with `{ error }` too, with no message.
 */
export async function callAuth<T extends { error: unknown }>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch {
    return { data: null, error: { message: undefined, status: 0, code: undefined } };
  }
}

export async function endSession<T extends { error: unknown }>(operation: () => Promise<T>) {
  const result = await callAuth(operation);
  if (result.error) return result;
  // Sign-in pages reload the page, and signup creates no session until email verification.
  // Until then, stale checks cannot restore this session.
  sessionStore.listen((state) => {
    if (state.data || state.error) settleSignedOut();
  });
  settleSignedOut();
  return result;
}

function settleSignedOut() {
  sessionStore.set({
    data: null,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: sessionStore.get().refetch,
  });
}
let checkingSession: Promise<void> | undefined;

/** Rechecks the session that `useSession` reads, unless it is already signed out. Callers during a check share it. */
export async function recheckSession() {
  if (classifySession(sessionStore.get()) === "signed-out") return;
  checkingSession ??= checkSession();
  await checkingSession;
}

async function checkSession() {
  try {
    await sessionStore.get().refetch();
  } finally {
    checkingSession = undefined;
  }
}
