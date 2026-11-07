import { Turnstile } from "@marsidev/react-turnstile";
import { useTheme } from "next-themes";
import { useRef, useState } from "react";
import { env } from "@myakiba/env/web";
import { cn } from "@/lib/utils";

type CaptchaState =
  | { readonly kind: "checking" }
  | { readonly kind: "interactive" }
  | { readonly kind: "ready"; readonly token: string }
  | { readonly kind: "failed" };

const CHECKING: CaptchaState = { kind: "checking" };

/**
 * Tracks one form's Turnstile token. `token()` hands out the current token and starts a fresh
 * challenge, because Cloudflare accepts each token once. With no token yet it waits for one, so
 * a submit made while the invisible check runs goes through when the check passes. It resolves
 * `null` when the check failed; `<Captcha>` then tells the user what to do.
 */
export function useCaptcha() {
  const current = useRef<CaptchaState>(CHECKING);
  const waiter = useRef<((token: string | null) => void) | null>(null);
  const [state, setState] = useState<CaptchaState>(CHECKING);
  const [waiting, setWaiting] = useState(false);
  const [challenge, setChallenge] = useState(0);

  const enter = (next: CaptchaState) => {
    current.current = next;
    setState(next);
  };

  const spend = (token: string) => {
    enter(CHECKING);
    setChallenge((count) => count + 1);
    return token;
  };

  const settle = (next: CaptchaState) => {
    enter(next);
    const resolve = waiter.current;
    if (!resolve || (next.kind !== "ready" && next.kind !== "failed")) return;
    waiter.current = null;
    setWaiting(false);
    resolve(next.kind === "ready" ? spend(next.token) : null);
  };

  const token = (): Promise<string | null> => {
    const now = current.current;
    if (now.kind === "ready") return Promise.resolve(spend(now.token));
    if (now.kind === "failed") return Promise.resolve(null);
    setWaiting(true);
    return new Promise((resolve) => {
      waiter.current = resolve;
    });
  };

  return { token, state, waiting, challenge, settle } as const;
}

type CaptchaHandle = ReturnType<typeof useCaptcha>;

function noticeFor({ state, waiting }: CaptchaHandle) {
  if (state.kind === "failed") {
    return "We couldn't run the browser check. Reload the page, or pause any ad or content blocker for this site, then try again.";
  }
  if (!waiting) return null;
  return state.kind === "interactive"
    ? "Complete the check above to continue."
    : "Checking your browser…";
}

/**
 * The Turnstile challenge, sized to its form and drawn in the app's theme, with a status line
 * that explains a wait or a failure. Most visitors never see either.
 */
export function Captcha({ captcha }: { readonly captcha: CaptchaHandle }) {
  const { resolvedTheme } = useTheme();
  const { settle } = captcha;
  const fail = () => settle({ kind: "failed" });
  return (
    <div className="grid gap-2">
      <Turnstile
        key={captcha.challenge}
        siteKey={env.VITE_TURNSTILE_SITE_KEY}
        onSuccess={(token) => settle({ kind: "ready", token })}
        onExpire={() => settle(CHECKING)}
        onBeforeInteractive={() => settle({ kind: "interactive" })}
        onError={fail}
        onUnsupported={fail}
        scriptOptions={{ onError: fail }}
        options={{
          size: "flexible",
          theme: resolvedTheme === "dark" ? "dark" : "light",
          // Most visitors pass silently; the widget appears only when Cloudflare needs input.
          appearance: "interaction-only",
          refreshExpired: "auto",
          refreshTimeout: "auto",
        }}
      />
      {/* Mounted while empty so screen readers track the live region; sr-only keeps it out of the layout. */}
      <p
        role="status"
        className={cn(
          "text-sm empty:sr-only",
          captcha.state.kind === "failed" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {noticeFor(captcha)}
      </p>
    </div>
  );
}
