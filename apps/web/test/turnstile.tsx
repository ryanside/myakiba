import { useEffect, useRef } from "react";

/** Stands in for Cloudflare's widget: it passes its check once it mounts. */
export function PassingTurnstile({
  onSuccess,
}: {
  readonly onSuccess?: (token: string) => void;
}): null {
  const passed = useRef(false);
  useEffect(() => {
    if (passed.current) return;
    passed.current = true;
    onSuccess?.("turnstile-test-token");
  }, [onSuccess]);
  return null;
}
