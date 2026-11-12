import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { useIsMutating } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Result } from "better-result";
import { toast } from "@/components/ui/toast";
import { authClient, decodeAuth } from "@/lib/auth-client";
import { AuthRequestFailed } from "@/lib/errors/auth-request-failed";
import { getAccountType } from "@/queries/settings";
import { defineCommand, messageAs, rootedRead, useResourceMutation } from "../client";

type SignedInSession = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number];

/** Better Auth allows some account changes, and the devices list, only within a day of signing in. */
export function isStaleSignIn(failure: AuthRequestFailed): boolean {
  return failure.code === "SESSION_NOT_FRESH" || failure.code === "SESSION_EXPIRED";
}

/** The same refusal, saying `fallback` when Better Auth gave no text. */
function withFallback(failure: AuthRequestFailed, fallback: string): AuthRequestFailed {
  if (failure.message) return failure;
  const { code, status, statusText, cause } = failure;
  return new AuthRequestFailed({ code, status, statusText, cause, message: fallback });
}

/**
 * A stale sign-in is an expected answer, so it is a result rather than an error. The current
 * session comes from the same load, because changing the password gives this device a new one.
 */
export type Devices =
  | {
      readonly kind: "listed";
      readonly currentSessionId: string;
      readonly sessions: readonly SignedInSession[];
    }
  | { readonly kind: "needs-fresh-sign-in" };

async function loadDevices(): Promise<Result<Devices, AuthRequestFailed>> {
  const [listed, current] = await Promise.all([
    decodeAuth(() => authClient.listSessions()),
    decodeAuth(() => authClient.getSession()),
  ]);
  if (listed.isErr()) {
    if (isStaleSignIn(listed.error)) return Result.ok({ kind: "needs-fresh-sign-in" });
    return Result.err(withFallback(listed.error, "Couldn't load your devices"));
  }
  if (current.isErr()) return Result.err(withFallback(current.error, "Couldn't check this device"));
  if (!current.value) {
    return Result.err(
      new AuthRequestFailed({
        code: null,
        status: null,
        statusText: "",
        cause: null,
        message: "Couldn't check this device",
      }),
    );
  }
  return Result.ok({
    kind: "listed",
    currentSessionId: current.value.session.id,
    sessions: listed.value.toSorted(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  });
}

async function loadLinkedAccounts() {
  const listed = await decodeAuth(() => authClient.listAccounts());
  return listed.mapError((failure) => withFallback(failure, "Couldn't load your sign-in methods"));
}

async function loadUsernameAvailability(username: string) {
  const checked = await decodeAuth(() => authClient.isUsernameAvailable({ username }));
  return checked
    .map(({ available }) => available)
    .mapError((failure) => withFallback(failure, "Couldn't check that username"));
}

/** Runs a Better Auth write. A refusal without text says `fallback`. */
async function authWrite<Answer extends Parameters<typeof decodeAuth>[0]>(
  operation: Answer,
  fallback: string,
): Promise<Result<void, AuthRequestFailed>> {
  const written = await decodeAuth(operation);
  return written.andThen(() => Result.ok()).mapError((failure) => withFallback(failure, fallback));
}

/** Like the devices list, removing a sign-in method needs a recent sign-in. */
type GoogleUnlink = { readonly kind: "unlinked" } | { readonly kind: "needs-fresh-sign-in" };

/** `accountId` is the local account row's `id`, not Google's account id. */
async function unlinkGoogle(accountId: string): Promise<Result<GoogleUnlink, AuthRequestFailed>> {
  const unlinked = await decodeAuth(() => authClient.unlinkAccount({ accountId }));
  if (unlinked.isOk()) return Result.ok({ kind: "unlinked" });
  if (isStaleSignIn(unlinked.error)) return Result.ok({ kind: "needs-fresh-sign-in" });
  return Result.err(withFallback(unlinked.error, "Couldn't disconnect Google"));
}

const SIGN_OUT_DELAY = "It can take up to 5 minutes to sign out there.";

/** A change to the signed-in user. `fallback` is the failure toast's title when Better Auth gives no text. */
type UserUpdate = {
  readonly changes: Parameters<typeof authClient.updateUser>[0];
  readonly fallback: string;
};

export const settings = {
  accountType: rootedRead("accountType", {
    key: () => ["account-type"] as const,
    load: getAccountType,
    staleTime: 1000 * 60 * 5,
    retry: false,
  }),
  devices: rootedRead("devices", {
    key: () => ["devices"] as const,
    load: loadDevices,
    retry: false,
  }),
  linkedAccounts: rootedRead("linkedAccounts", {
    key: () => ["linked-accounts"] as const,
    load: loadLinkedAccounts,
    retry: false,
  }),
  usernameAvailability: rootedRead("usernameAvailability", {
    key: (username: string) => ["username-availability", username] as const,
    load: loadUsernameAvailability,
    staleTime: 1000 * 30,
    retry: false,
  }),
  /** Signs every other device out, so this one gets a new session. The form shows a failure. */
  changePassword: defineCommand({
    invalidates: ["devices"],
    persist: ({
      currentPassword,
      newPassword,
    }: {
      readonly currentPassword: string;
      readonly newPassword: string;
    }) =>
      authWrite(
        () =>
          authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }),
        "Couldn't change your password",
      ),
    successTitle: () => "Password changed",
    successDescription: () => "Your other devices were signed out.",
  }),
  revokeSession: defineCommand({
    invalidates: ["devices"],
    persist: ({ token, name }: { readonly token: string; readonly name: string }) =>
      authWrite(() => authClient.revokeSession({ token }), `Couldn't sign out of ${name}`),
    successTitle: ({ name }) => `Signed out of ${name}`,
    successDescription: () => SIGN_OUT_DELAY,
    failureToast: messageAs("title", ({ name }) => `Couldn't sign out of ${name}`),
  }),
  revokeOtherSessions: defineCommand({
    invalidates: ["devices"],
    persist: () =>
      authWrite(() => authClient.revokeOtherSessions(), "Couldn't sign out other devices"),
    successTitle: () => "Signed out of other devices",
    successDescription: () => SIGN_OUT_DELAY,
    failureToast: messageAs("title", () => "Couldn't sign out other devices"),
  }),
  unlinkGoogle: defineCommand({
    invalidates: ["linkedAccounts", "accountType"],
    persist: (accountId: string) => unlinkGoogle(accountId),
    successTitle: (_input, unlink) =>
      unlink.kind === "unlinked" ? "Google disconnected" : undefined,
    failureToast: messageAs("title", () => "Couldn't disconnect Google"),
  }),
  /** The session holds the user, so a screen reloads the router once this saves. */
  updateUser: defineCommand({
    invalidates: "nothing",
    persist: ({ changes, fallback }: UserUpdate) =>
      authWrite(() => authClient.updateUser(changes), fallback),
    failureToast: messageAs("title", ({ fallback }) => fallback),
  }),
};

export type Formats = { readonly currency: Currency; readonly dateFormat: DateFormat };

const PREFERENCES_FAILED = "Failed to update preferences";

/** Every Preferences save shares this key, so a form mounted mid-save still sees it in flight. */
const SAVE_PREFERENCES = ["save-preferences"] as const;

/** One save at a time across the app. `save` never rejects. */
export function usePreferencesSave() {
  const router = useRouter();
  const saving = useIsMutating({ mutationKey: SAVE_PREFERENCES }) > 0;
  const { run } = useResourceMutation(settings.updateUser, {
    mutationKey: SAVE_PREFERENCES,
    onSaved: async () => {
      await router.invalidate();
      toast.add({ type: "success", title: "Preferences updated successfully" });
    },
  });
  const save = (changes: Partial<Formats>) => run({ changes, fallback: PREFERENCES_FAILED });

  return { save, saving } as const;
}
