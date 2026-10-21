import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SessionUnavailable() {
  const { refetch, isRefetching } = authClient.useSession();

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-6 py-14" role="alert">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <header className="flex flex-col items-center gap-4">
          <h1 className="text-balance text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            Couldn&apos;t check your session
          </h1>
          <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Something went wrong reaching the server. Try again in a moment.
          </p>
        </header>
        <Button size="lg" disabled={isRefetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
