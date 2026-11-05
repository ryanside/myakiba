import { Turnstile } from "@marsidev/react-turnstile";
import { useTheme } from "next-themes";
import { env } from "@myakiba/env/web";

/** The Turnstile challenge, sized to its form and drawn in the app's theme. */
export function Captcha({ onSuccess }: { readonly onSuccess: (token: string) => void }) {
  const { resolvedTheme } = useTheme();
  return (
    <Turnstile
      siteKey={env.VITE_TURNSTILE_SITE_KEY}
      onSuccess={onSuccess}
      options={{
        size: "flexible",
        theme: resolvedTheme === "dark" ? "dark" : "light",
        // Most visitors pass silently; the widget appears only when Cloudflare needs input.
        appearance: "interaction-only",
      }}
    />
  );
}
