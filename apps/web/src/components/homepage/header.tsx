import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CONTAINER } from "@/components/homepage/kit";
import { DISCORD_URL, GITHUB_URL } from "@/components/homepage/links";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { DiscordLogo, GitHubLogo } from "@/components/ui/brand-icons";
import { cn } from "@/lib/utils";

const NAV_LINK = "block text-sm text-muted-foreground color-motion hover:text-foreground";

export function HomeHeader() {
  const scrolled = useScrolled();

  return (
    <header
      data-scrolled={scrolled ? "" : undefined}
      className={cn(
        "sticky top-0 z-40",
        "transition-[background-color,backdrop-filter] duration-200 ease-out motion-reduce:transition-none",
        "data-scrolled:bg-background/70 data-scrolled:backdrop-blur-xl data-scrolled:backdrop-saturate-150",
      )}
    >
      <div className={CONTAINER}>
        <div className="flex items-center justify-between gap-6 py-2.5">
          <div className="flex items-center gap-12">
            <Link
              to="/"
              aria-label="myakiba"
              onClick={scrollToTop}
              className="flex h-8 items-center"
            >
              <MyAkibaLogo size="full" className="my-0 h-[1.125rem] w-[5.75rem]" />
            </Link>
            <nav aria-label="Main" className="max-lg:hidden">
              <ul className="flex gap-8">
                <li>
                  <a href="#how-it-works" className={NAV_LINK}>
                    How it works
                  </a>
                </li>
                <li>
                  <Link to="/changelog" className={NAV_LINK}>
                    Changelog
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:hidden"
              render={
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View myakiba on GitHub"
                  title="GitHub"
                />
              }
              nativeButton={false}
            >
              <GitHubLogo className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-sm:hidden"
              render={
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Join myakiba on Discord"
                  title="Discord"
                />
              }
              nativeButton={false}
            >
              <DiscordLogo className="size-4 [&_path]:fill-current" />
            </Button>
            <ThemeToggle />
            <div className="ml-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                render={<Link to="/login" />}
                nativeButton={false}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                className="max-sm:hidden"
                render={<Link to="/signup" />}
                nativeButton={false}
              >
                Get started
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export function scrollToTop() {
  window.scrollTo({ top: 0 });
}

function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return scrolled;
}
