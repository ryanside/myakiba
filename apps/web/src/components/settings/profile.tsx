import { Alert02Icon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusButton, useButtonStatus } from "@/components/ui/status-button";
import { toast } from "@/components/ui/toast";
import { useRead } from "@/data/client";
import { settings } from "@/data/resources/settings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { authClient, callAuth } from "@/lib/auth-client";
import type { User } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { SettingsGroup, SettingsGroupFooter } from "./settings-group";
import { SettingsRow } from "./settings-row";

type UsernameCheck =
  | { readonly kind: "unchanged" }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "checking" }
  | { readonly kind: "available" }
  | { readonly kind: "taken" }
  | { readonly kind: "failed"; readonly message: string };

// The server lowercases usernames and allows 3 to 30 of these characters.
function usernameProblem(username: string): string | null {
  if (username.length < 3) return "Use at least 3 characters";
  if (username.length > 30) return "Use 30 characters or fewer";
  if (!/^[a-z0-9_.]+$/.test(username)) return "Use only letters, numbers, dots and underscores";
  return null;
}

function useUsernameCheck(draft: string, saved: string): UsernameCheck {
  const settled = useDebouncedValue(draft, 400);
  const problem = usernameProblem(draft);
  const isChanged = draft !== saved;
  const availability = useRead(settings.usernameAvailability, draft, {
    enabled: isChanged && problem === null && settled === draft,
  });

  if (!isChanged) return { kind: "unchanged" };
  if (problem) return { kind: "invalid", message: problem };
  if (settled !== draft || availability.isPending) return { kind: "checking" };
  if (availability.isError) return { kind: "failed", message: availability.error.message };
  return availability.data ? { kind: "available" } : { kind: "taken" };
}

const CHECK_TEXT = {
  checking: { icon: Loading03Icon, text: "Checking…", tone: "text-muted-foreground" },
  available: { icon: Tick02Icon, text: "Available", tone: "text-success-foreground" },
  taken: { icon: Alert02Icon, text: "Taken", tone: "text-destructive" },
} as const;

function CheckMessage({ check }: { readonly check: UsernameCheck }) {
  if (check.kind === "unchanged") return null;
  if (check.kind === "invalid" || check.kind === "failed") {
    return <span className="text-muted-foreground">{check.message}</span>;
  }
  const { icon, text, tone } = CHECK_TEXT[check.kind];
  return (
    <span className={cn("inline-flex items-center gap-1", tone)}>
      <HugeiconsIcon
        icon={icon}
        className={cn(
          "size-3.5",
          check.kind === "checking" && "animate-spin motion-reduce:animate-none",
        )}
        strokeWidth={2}
        aria-hidden="true"
      />
      {text}
    </span>
  );
}

export function Profile({ user }: { user: User }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const messageId = useId();
  const [saved, setSaved] = useState(user.username ?? "");
  const [draft, setDraft] = useState(saved);
  const [isSaving, setIsSaving] = useState(false);
  const { status, run } = useButtonStatus();
  const check = useUsernameCheck(draft, saved);

  const save = async () => {
    if (check.kind !== "available") {
      inputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    const { error } = await run(
      () => callAuth(() => authClient.updateUser({ username: draft })),
      (result) => !result.error,
    );
    setIsSaving(false);
    if (error) {
      toast.add({ type: "error", title: error.message || "Failed to update profile" });
      return;
    }
    setSaved(draft);
    await router.invalidate();
    toast.add({ type: "success", title: "Profile updated successfully" });
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        return save();
      }}
    >
      <SettingsGroup title="Name">
        <SettingsRow
          setting="username"
          htmlFor={inputId}
          status={
            <span id={messageId} aria-live="polite" className="text-xs">
              <CheckMessage check={check} />
            </span>
          }
        >
          <Input
            ref={inputRef}
            id={inputId}
            name="username"
            value={draft}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            aria-describedby={messageId}
            aria-invalid={check.kind === "invalid" || check.kind === "taken" || undefined}
            onChange={(event) => setDraft(event.target.value.toLowerCase())}
            className="sm:w-64"
          />
        </SettingsRow>
        <SettingsGroupFooter>
          <StatusButton
            type="submit"
            status={status}
            successLabel="Saved"
            disabled={check.kind === "unchanged" || isSaving}
          >
            Save changes
          </StatusButton>
        </SettingsGroupFooter>
      </SettingsGroup>
    </form>
  );
}
