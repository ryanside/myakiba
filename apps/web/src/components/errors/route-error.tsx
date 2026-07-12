import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const STALE_ASSET_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk .+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
] as const;

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);
  const message = error instanceof Error ? error.message : String(error);

  if (
    STALE_ASSET_ERROR_PATTERNS.some((pattern) =>
      pattern.test(error instanceof Error ? `${error.name}: ${message}` : message),
    )
  ) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center px-6 py-14">
        <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
          <header className="flex flex-col items-center gap-4">
            <h1 className="text-balance text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              A new version is ready
            </h1>
            <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              This page needs the latest app files before it can open. Refresh to continue where you
              left off.
            </p>
          </header>
          <div>
            <Button size="lg" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-6 py-14">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <header className="flex flex-col items-center gap-4">
          <h1 className="text-balance text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            Something went wrong
          </h1>
          <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Try this page again. If the problem continues, refresh the app or let us know on{" "}
            <a
              href="https://discord.gg/VKHVvhcC2z"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              Discord
            </a>
            .
          </p>
        </header>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button size="lg" onClick={() => void router.invalidate()}>
            Try again
          </Button>
          <Button
            aria-controls="route-error-details"
            aria-expanded={showDetails}
            size="lg"
            variant="outline"
            onClick={() => setShowDetails((visible) => !visible)}
          >
            {showDetails ? "Hide error" : "Show error"}
          </Button>
        </div>
        {showDetails ? (
          <div id="route-error-details" className="w-full border-t border-border pt-8 text-start">
            <p className="mb-3 text-sm text-muted-foreground">Error details</p>
            <pre className="max-w-full overflow-auto rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_8%,transparent)]">
              <code>{message}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </main>
  );
}
