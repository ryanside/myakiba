import { Link } from "@tanstack/react-router";
import { scrollToTop } from "@/components/homepage/header";
import { CONTAINER } from "@/components/homepage/kit";
import { DISCORD_URL, GITHUB_URL } from "@/components/homepage/links";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { cn } from "@/lib/utils";

const LINK = "text-sm text-muted-foreground color-motion hover:text-foreground";

export function HomeFooter() {
  return (
    <footer>
      <div
        className={cn(
          CONTAINER,
          "flex flex-wrap items-center justify-between gap-x-6 gap-y-4 pt-16 pb-12 md:pt-24",
        )}
      >
        <div className="flex items-center gap-4">
          <Link
            to="/"
            aria-label="myakiba home"
            onClick={scrollToTop}
            className="flex h-9 items-center"
          >
            <MyAkibaLogo size="full" className="my-0 h-[1.125rem] w-[5.75rem]" />
          </Link>
          <p className="text-sm text-muted-foreground">
            Made by{" "}
            <a
              href="https://github.com/ryanside"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:underline"
            >
              @ryanside
            </a>
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/changelog" className={LINK}>
            Changelog
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            GitHub
          </a>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            Discord
          </a>
        </nav>
      </div>
    </footer>
  );
}
