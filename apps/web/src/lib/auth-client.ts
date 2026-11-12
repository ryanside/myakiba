import { createAuthClient } from "better-auth/react";
import { adminClient, usernameClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@myakiba/auth/server";
import { env } from "@myakiba/env/web";
import { Result } from "better-result";
import { AuthRequestFailed } from "@/lib/errors/auth-request-failed";

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

/** What a Better Auth client call resolves with when it gets an answer. */
type AuthAnswer<Data> =
  | { readonly data: Data; readonly error: null }
  | {
      readonly data: null;
      readonly error: {
        readonly code?: string | undefined;
        readonly message?: string | undefined;
        readonly status: number;
        readonly statusText: string;
      };
    };

/** Reads a Better Auth answer without changing the server's refusal text. */
function decodeAuthAnswer<Answer extends AuthAnswer<unknown>>(
  answer: Answer,
): Result<Extract<Answer, { readonly error: null }>["data"], AuthRequestFailed> {
  if (answer.error === null) return Result.ok(answer.data);
  const { code, message, status, statusText } = answer.error;
  return Result.err(
    new AuthRequestFailed({
      code: code ?? null,
      status,
      statusText,
      cause: answer.error,
      message: message ?? "",
    }),
  );
}

/** Owns the request so a fetch rejection answers AuthRequestFailed too. */
export async function decodeAuth<Answer extends AuthAnswer<unknown>>(
  operation: () => PromiseLike<Answer>,
): Promise<Result<Extract<Answer, { readonly error: null }>["data"], AuthRequestFailed>> {
  const answered = await Result.tryPromise({
    try: async () => operation(),
    catch: (cause) =>
      new AuthRequestFailed({
        code: null,
        status: null,
        statusText: "",
        cause,
        message: "Couldn't connect. Check your connection and try again.",
      }),
  });
  return answered.andThen(decodeAuthAnswer);
}

/** Signs out or deletes the account, and on success settles the session store as signed out. */
export async function endSession(
  operation: () => Promise<AuthAnswer<unknown>>,
): Promise<Result<void, AuthRequestFailed>> {
  const ended = await decodeAuth(operation);
  if (ended.isErr()) return Result.err(ended.error);
  // Sign-in pages reload the page, and signup creates no session until email verification.
  // Until then, stale checks cannot restore this session.
  sessionStore.listen((state) => {
    if (state.data || state.error) settleSignedOut();
  });
  settleSignedOut();
  return Result.ok();
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
