import { Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Captcha } from "@/components/auth/captcha";
import { useResendVerification } from "@/hooks/use-resend-verification";

const RETURN_TO_ADD = "/add";

export function VerifyEmailNotice({ email }: { readonly email: string }) {
  const { resend, isSending, secondsLeft, captcha } = useResendVerification(email, RETURN_TO_ADD);
  return (
    // Its button is wider than the room an Alert keeps for an action, and on a phone it goes below.
    <Alert
      role="note"
      className="sm:has-data-[slot=alert-action]:pr-54 max-sm:has-data-[slot=alert-action]:pr-2.5"
    >
      <HugeiconsIcon icon={Mail01Icon} className="text-muted-foreground" aria-hidden="true" />
      <AlertDescription className="text-foreground">
        Verify your email to add these. Check the email sent to{" "}
        <span className="[overflow-wrap:anywhere]">{email}</span>.
      </AlertDescription>
      <div className="col-start-2">
        <Captcha captcha={captcha} />
      </div>
      <AlertAction className="max-sm:static max-sm:col-start-2 max-sm:mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSending || secondsLeft > 0}
          onClick={resend}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend verification email"}
        </Button>
      </AlertAction>
    </Alert>
  );
}
