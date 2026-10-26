import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { authClient, callAuth } from "@/lib/auth-client";
import { getAccountType } from "@/queries/settings";
import { defineCommand, rootedRead } from "../client";

type SignedInSession = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number];

/** Better Auth allows some account changes, and the devices list, only within a day of signing in. */
export function isStaleSignIn(error: { readonly code?: string | undefined } | null): boolean {
  return error?.code === "SESSION_NOT_FRESH" || error?.code === "SESSION_EXPIRED";
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

async function loadDevices(): Promise<Devices> {
  const [{ data, error }, current] = await Promise.all([
    authClient.listSessions(),
    authClient.getSession(),
  ]);
  if (isStaleSignIn(error)) return { kind: "needs-fresh-sign-in" };
  if (error) throw new Error(error.message || "Couldn't load your devices");
  if (!current.data) throw new Error(current.error?.message || "Couldn't check this device");
  return {
    kind: "listed",
    currentSessionId: current.data.session.id,
    sessions: data.toSorted(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  };
}

async function loadLinkedAccounts() {
  const { data, error } = await authClient.listAccounts();
  if (error) throw new Error(error.message || "Couldn't load your sign-in methods");
  return data;
}

async function loadUsernameAvailability(username: string) {
  const { data, error } = await authClient.isUsernameAvailable({ username });
  if (error) throw new Error(error.message || "Couldn't check that username");
  return data.available;
}

/** Runs a Better Auth write and throws its message, or `fallback` when it has none. */
async function authWrite(
  operation: () => Promise<{ readonly error: { readonly message?: string | undefined } | null }>,
  fallback: string,
): Promise<void> {
  const { error } = await callAuth(operation);
  if (error) throw new Error(error.message || fallback);
}

/** Like the devices list, removing a sign-in method needs a recent sign-in. */
type GoogleUnlink = { readonly kind: "unlinked" } | { readonly kind: "needs-fresh-sign-in" };

async function unlinkGoogle(): Promise<GoogleUnlink> {
  const { error } = await callAuth(() => authClient.unlinkAccount({ providerId: "google" }));
  if (isStaleSignIn(error)) return { kind: "needs-fresh-sign-in" };
  if (error) throw new Error(error.message || "Couldn't disconnect Google");
  return { kind: "unlinked" };
}

const SIGN_OUT_DELAY = "It can take up to 5 minutes to sign out there.";

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
    failureTitle: (_input, error) => error.message,
  }),
  revokeOtherSessions: defineCommand({
    invalidates: ["devices"],
    persist: () =>
      authWrite(() => authClient.revokeOtherSessions(), "Couldn't sign out other devices"),
    successTitle: () => "Signed out of other devices",
    successDescription: () => SIGN_OUT_DELAY,
    failureTitle: (_input, error) => error.message,
  }),
  unlinkGoogle: defineCommand({
    invalidates: ["linkedAccounts", "accountType"],
    persist: () => unlinkGoogle(),
    successTitle: (_input, unlink) =>
      unlink.kind === "unlinked" ? "Google disconnected" : undefined,
    failureTitle: (_input, error) => error.message,
  }),
};

export type Formats = { readonly currency: Currency; readonly dateFormat: DateFormat };

/** Every Preferences save shares this key, so a form mounted mid-save still sees it in flight. */
const SAVE_PREFERENCES = ["save-preferences"] as const;

/** One save at a time across the app. `save` never rejects and resolves whether it saved. */
export function usePreferencesSave() {
  const router = useRouter();
  const saving = useIsMutating({ mutationKey: SAVE_PREFERENCES }) > 0;
  const { mutateAsync } = useMutation({
    mutationKey: SAVE_PREFERENCES,
    mutationFn: async (changes: Partial<Formats>) => {
      const { error } = await callAuth(() => authClient.updateUser(changes));
      if (error) throw new Error(error.message || "Failed to update preferences");
    },
    onSuccess: async () => {
      await router.invalidate();
      toast.add({ type: "success", title: "Preferences updated successfully" });
    },
    onError: (error) => toast.add({ type: "error", title: error.message }),
  });

  const save = async (changes: Partial<Formats>) => {
    try {
      await mutateAsync(changes);
      return true;
    } catch {
      return false;
    }
  };

  return { save, saving } as const;
}
