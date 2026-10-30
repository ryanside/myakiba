import { Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { useResendVerification } from "@/hooks/use-resend-verification";

const RETURN_TO_ADD = "/add";

export function VerifyEmailNotice({ email }: { readonly email: string }) {
  const { resend, isSending, secondsLeft } = useResendVerification(email, RETURN_TO_ADD);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
      <HugeiconsIcon
        icon={Mail01Icon}
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 basis-48 text-pretty">
        Verify your email to add these. Check the email sent to{" "}
        <span className="[overflow-wrap:anywhere]">{email}</span>.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSending || secondsLeft > 0}
        onClick={resend}
      >
        {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend verification email"}
      </Button>
    </div>
  );
}
