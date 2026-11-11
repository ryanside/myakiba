import { useEffect, useState } from "react";
import { useCaptcha } from "@/components/auth/captcha";
import { toast } from "@/components/ui/toast";
import { authClient, decodeAuth } from "@/lib/auth-client";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";

const RESEND_COOLDOWN_SECONDS = 60;

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

/**
 * Sends the verification email again, at most once a minute. The server asks for a Turnstile
 * token, so the caller renders `<Captcha captcha={captcha} />` beside its button.
 */
export function useResendVerification(email: string, returnTo: string) {
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const secondsLeft = useSecondsUntil(resendAt);
  const captcha = useCaptcha();

  const resend = async () => {
    setIsSending(true);
    const captchaToken = await captcha.token();
    if (captchaToken === null) {
      setIsSending(false);
      return;
    }
    const sent = await decodeAuth(() =>
      authClient.sendVerificationEmail(
        { email, callbackURL: getAuthRedirectUrl(returnTo) },
        { headers: { "x-captcha-response": captchaToken } },
      ),
    );
    setIsSending(false);
    if (sent.isErr()) {
      toast.add({
        type: "error",
        title:
          sent.error.status === 429
            ? "You just asked for one. Try again in a minute."
            : sent.error.message || "Couldn't send the email. Try again.",
      });
      return;
    }
    setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    toast.add({ type: "success", title: `Verification email sent to ${email}` });
  };

  return { resend, isSending, secondsLeft, captcha } as const;
}
