import { SquareLockPasswordIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { authClient, callAuth } from "@/lib/auth-client";
import type { SettingsSectionId } from "./settings-registry";

/** Where Better Auth's redirects and the login page bring the user back to. */
export const RETURN_TO_ACCOUNT: `/settings?section=${SettingsSectionId}` =
  "/settings?section=account";

/** Signs out and opens the login page, which brings the user back to Account afterwards. */
export async function signInAgain(): Promise<void> {
  const { error } = await callAuth(() => authClient.signOut());
  if (error) {
    toast.add({ type: "error", title: error.message || "Couldn't sign out. Try again." });
    return;
  }
  window.location.assign(`/login?redirect=${encodeURIComponent(RETURN_TO_ACCOUNT)}`);
}

function SignInAgainButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isSigningOut}
      onClick={async () => {
        setIsSigningOut(true);
        await signInAgain();
        setIsSigningOut(false);
      }}
    >
      Sign in again
    </Button>
  );
}

/** Better Auth allows some account changes only within a day of signing in. */
export function FreshSignInNotice({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="@container">
      <div className="flex flex-col items-start gap-3 px-4 py-4 @md:flex-row @md:items-center @md:gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <HugeiconsIcon icon={SquareLockPasswordIcon} className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-balance text-sm font-medium">{title}</p>
          <p className="text-pretty text-[13px] leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
        <SignInAgainButton />
      </div>
    </div>
  );
}
