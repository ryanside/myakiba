import { MyAkibaLogo } from "@/components/myakiba-logo";
import { DiscordLogo, GitHubLogo } from "@/components/ui/brand-icons";

export default function FooterSection() {
  return (
    <footer className="py-8">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <MyAkibaLogo size="full" className="hidden sm:block size-20 my-0" />
          <span className="text-muted-foreground text-sm">
            made by{" "}
            <a
              href="https://github.com/ryanside"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline underline-offset-2"
            >
              @ryanside
            </a>
          </span>
          <span className="text-muted-foreground text-sm">
            homepage inspired by{" "}
            <a
              href="https://cmux.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline underline-offset-2"
            >
              cmux
            </a>
          </span>
        </div>

        <nav className="flex items-center gap-3">
          <a
            href="https://discord.gg/VKHVvhcC2z"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Discord"
          >
            <DiscordLogo className="size-4" />
          </a>
          <a
            href="https://github.com/ryanside/myakiba"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <GitHubLogo className="size-4" />
          </a>
        </nav>
      </div>
    </footer>
  );
}
