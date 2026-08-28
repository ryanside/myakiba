import { MyAkibaLogo } from "@/components/myakiba-logo";
import { Button } from "@/components/ui/button";
import { DiscordLogo, GitHubLogo } from "@/components/ui/brand-icons";

export default function FooterSection() {
  return (
    <footer className="py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-6 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
        <div className="flex flex-col items-start gap-3 min-[520px]:flex-row min-[520px]:items-center">
          <MyAkibaLogo size="full" className="hidden sm:block size-20 pt-0.5" />
          <span className="text-muted-foreground text-sm leading-5 whitespace-nowrap">
            made by{" "}
            <a
              href="https://github.com/ryanside"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              @ryanside
            </a>
          </span>
          <span className="text-muted-foreground text-sm leading-5 whitespace-nowrap">
            see{" "}
            <a href="/changelog" className="text-foreground hover:underline">
              changelog
            </a>
          </span>
        </div>

        <nav className="-ml-1 flex items-center gap-2 min-[900px]:ml-0" aria-label="Social links">
          <Button
            variant="ghost"
            size="icon-sm"
            render={
              <a
                href="https://discord.gg/VKHVvhcC2z"
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
          <Button
            variant="ghost"
            size="icon-sm"
            render={
              <a
                href="https://github.com/ryanside/myakiba"
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
        </nav>
      </div>
    </footer>
  );
}
