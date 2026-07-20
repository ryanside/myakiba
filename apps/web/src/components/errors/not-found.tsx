import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-6 py-14">
      <div className="flex max-w-xl flex-col items-center gap-8 text-center">
        <header className="flex flex-col items-center gap-4">
          <h1 className="text-balance text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            404 - Page not found
          </h1>
          <p className="max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            The page you’re looking for doesn’t exist or may have moved.
          </p>
        </header>

        <Button size="lg" render={<Link to="/" />} nativeButton={false}>
          Back to home
        </Button>
      </div>
    </main>
  );
}
