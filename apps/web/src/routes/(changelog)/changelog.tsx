import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/(changelog)/changelog")({
  component: ChangelogLayout,
});

function ChangelogLayout() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-sm">
        <nav
          className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-6"
          aria-label="Changelog navigation"
        >
          <Link
            to="/"
            className="flex min-h-10 items-center rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="myakiba home"
          >
            <MyAkibaLogo size="full" className="my-0 h-auto w-24" />
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button size="sm" render={<Link to="/dashboard" />} nativeButton={false}>
              Open app
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
