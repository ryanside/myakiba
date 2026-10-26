import { GoogleIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import { useForm } from "@tanstack/react-form";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusButton, useButtonStatus } from "@/components/ui/status-button";
import { toast } from "@/components/ui/toast";
import { useRead, useResourceMutation } from "@/data/client";
import { settings } from "@/data/resources/settings";
import { authClient, callAuth } from "@/lib/auth-client";
import type { User } from "@/lib/auth-client";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";
import { cn } from "@/lib/utils";
import { DeleteAccount } from "./delete-account";
import { Devices } from "./devices";
import { SettingsGroup } from "./settings-group";
import { SettingsRow } from "./settings-row";
import { RETURN_TO_ACCOUNT, signInAgain } from "./sign-in-again";

const MIN_PASSWORD_LENGTH = 8;
const MIN_PASSWORD_MESSAGE = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
const RESEND_COOLDOWN_SECONDS = 60;

const settingsRoute = getRouteApi("/(app)/settings");

// Better Auth sends a failed Google link back with one of these codes in `?error=`.
const LINK_ERRORS = new Map([
  ["email_doesn't_match", "That Google account uses a different email address."],
  [
    "account_already_linked_to_different_user",
    "That Google account is connected to another myakiba account.",
  ],
]);

export function Account({ user }: { readonly user: User }) {
  return (
    <>
      <SettingsGroup title="Sign-in">
        <EmailRow email={user.email} isVerified={user.emailVerified} />
        <PasswordRow />
        <GoogleRow />
      </SettingsGroup>
      <SettingsGroup title="Devices">
        <Devices
          // Better Auth types additional fields as strings, and the server only stores these enums.
          dateFormat={user.dateFormat as DateFormat}
        />
      </SettingsGroup>
      <SettingsGroup title="Danger zone">
        <DeleteAccount />
      </SettingsGroup>
    </>
  );
}

const STATUS_TONES = {
  positive: "text-success-foreground",
  muted: "text-muted-foreground",
  warning: "text-warning-foreground",
} as const;

function StatusText({
  tone,
  children,
}: {
  readonly tone: keyof typeof STATUS_TONES;
  readonly children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", STATUS_TONES[tone])}>
      {tone === "positive" ? (
        <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}

function useSecondsUntil(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(interval);
    };
    const interval = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(interval);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

function EmailRow({ email, isVerified }: { readonly email: string; readonly isVerified: boolean }) {
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const secondsLeft = useSecondsUntil(resendAt);

  return (
    <SettingsRow
      setting="email"
      status={
        isVerified ? (
          <StatusText tone="positive">Verified</StatusText>
        ) : (
          <StatusText tone="warning">Not verified</StatusText>
        )
      }
    >
      <span className="text-sm [overflow-wrap:anywhere] sm:text-right">{email}</span>
      {isVerified ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={isSending || secondsLeft > 0}
          onClick={async () => {
            setIsSending(true);
            const { error } = await callAuth(() =>
              authClient.sendVerificationEmail({
                email,
                callbackURL: getAuthRedirectUrl(RETURN_TO_ACCOUNT),
              }),
            );
            setIsSending(false);
            if (error) {
              toast.add({
                type: "error",
                title:
                  error.status === 429
                    ? "You just asked for one. Try again in a minute."
                    : error.message || "Couldn't send the email. Try again.",
              });
              return;
            }
            setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
            toast.add({ type: "success", title: `Verification email sent to ${email}` });
          }}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend verification email"}
        </Button>
      )}
    </SettingsRow>
  );
}

function PasswordRow() {
  const { data, isPending, isError } = useRead(settings.accountType);

  if (isPending || isError) {
    return (
      <SettingsRow
        setting="password"
        inline
        status={isError ? <StatusText tone="muted">Couldn’t check</StatusText> : null}
      >
        <Button variant="outline" size="sm" disabled>
          Change password
        </Button>
      </SettingsRow>
    );
  }

  if (!data.hasCredentialAccount) {
    return (
      <SettingsRow setting="password" inline status={<StatusText tone="muted">Not set</StatusText>}>
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/forgot-password" />}
          nativeButton={false}
        >
          Set a password
        </Button>
      </SettingsRow>
    );
  }

  return (
    <SettingsRow setting="password" inline status={<StatusText tone="positive">Set</StatusText>}>
      <ChangePasswordDialog />
    </SettingsRow>
  );
}

const PASSWORD_FIELDS = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm new password", autoComplete: "new-password" },
] as const;

function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const { status, run } = useButtonStatus();
  const changePassword = useResourceMutation(settings.changePassword, {
    onSaved: () => {
      setOpen(false);
      form.reset();
    },
  });
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: {
      onSubmit: z
        .object({
          currentPassword: z.string().min(1, "Enter your current password"),
          newPassword: z.string().min(MIN_PASSWORD_LENGTH, MIN_PASSWORD_MESSAGE),
          confirmPassword: z.string(),
        })
        .refine((value) => value.newPassword === value.confirmPassword, {
          message: "The new passwords don't match",
          path: ["confirmPassword"],
        }),
    },
    onSubmit: async ({ value, formApi }) => {
      const result = await run(
        () => changePassword.run(value),
        (outcome) => outcome.kind === "saved",
      );
      if (result.kind === "failed" && result.error instanceof Error) {
        const { message } = result.error;
        formApi.setFieldMeta("currentPassword", (meta) => ({
          ...meta,
          errorMap: { onSubmit: message },
        }));
      }
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Change password</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Your other devices will be signed out. This one stays signed in.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            return form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          {PASSWORD_FIELDS.map(({ name, label, autoComplete }) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field.name}>{label}</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete={autoComplete}
                    value={field.state.value}
                    aria-invalid={field.state.meta.errors.length > 0 || undefined}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          ))}
          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <StatusButton type="submit" status={status} disabled={isSubmitting}>
                  Change password
                </StatusButton>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function showFreshSignInToast() {
  const toastId = toast.add({
    type: "info",
    title: "Sign in again to disconnect Google",
    description: "myakiba asks for a sign-in from the last day before removing a sign-in method.",
    actionProps: {
      children: "Sign in again",
      onClick() {
        toast.close(toastId);
        return signInAgain();
      },
    },
  });
}

function GoogleRow() {
  const { data: accounts, isPending, isError } = useRead(settings.linkedAccounts);
  const [isConnecting, setIsConnecting] = useState(false);
  const unlink = useResourceMutation(settings.unlinkGoogle, {
    onSaved: (_input, result) => {
      if (result.kind === "needs-fresh-sign-in") showFreshSignInToast();
    },
  });
  const linkError = settingsRoute.useSearch({ select: (search) => search.error });
  const google = accounts?.find((account) => account.providerId === "google");
  const isOnlyMethod = google !== undefined && accounts?.length === 1;
  const linkProblem =
    linkError && !google
      ? (LINK_ERRORS.get(linkError) ?? "Google wasn't connected. Try again.")
      : null;

  // On success Better Auth sends the browser to Google, so the button stays busy until the page goes.
  const connect = async () => {
    setIsConnecting(true);
    const { error } = await callAuth(() =>
      authClient.linkSocial({
        provider: "google",
        callbackURL: getAuthRedirectUrl(RETURN_TO_ACCOUNT),
        errorCallbackURL: getAuthRedirectUrl(RETURN_TO_ACCOUNT),
      }),
    );
    if (error) {
      setIsConnecting(false);
      toast.add({ type: "error", title: error.message || "Couldn't connect Google" });
    }
  };

  let control: React.ReactNode = (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending || isError || isConnecting}
      onClick={connect}
    >
      <HugeiconsIcon icon={GoogleIcon} data-icon="inline-start" aria-hidden="true" />
      Connect
    </Button>
  );
  if (isOnlyMethod) {
    control = (
      <span className="text-[13px] text-muted-foreground">Set a password to disconnect</span>
    );
  } else if (google) {
    control = (
      <Button variant="outline" size="sm" disabled={unlink.isPending} onClick={() => unlink.run()}>
        Disconnect
      </Button>
    );
  }

  let status: React.ReactNode = null;
  if (google) status = <StatusText tone="positive">Connected</StatusText>;
  else if (linkProblem) status = <StatusText tone="warning">Couldn’t connect</StatusText>;

  return (
    <SettingsRow setting="google" inline={!linkProblem} status={status}>
      {control}
      {linkProblem ? (
        <p role="alert" className="text-pretty text-[13px] text-muted-foreground sm:text-right">
          {linkProblem}
        </p>
      ) : null}
    </SettingsRow>
  );
}
