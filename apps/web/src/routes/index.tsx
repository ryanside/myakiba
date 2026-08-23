import { createFileRoute, Link } from "@tanstack/react-router";
import FAQsSection from "@/components/homepage/faqs";
import { FeatureSplit } from "@/components/homepage/feature-split";
import FooterSection from "@/components/homepage/footer";
import { HeroShowcase } from "@/components/homepage/hero-showcase";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { PanelGallery } from "@/components/homepage/panel-gallery";
import { TextLoop } from "@/components/homepage/text-loop";
import { TyperHeadline } from "@/components/homepage/typer-headline";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useTheme } from "next-themes";
import { DiscordLogo, GitHubLogo } from "@/components/ui/brand-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import BounceCards from "@/components/bounce-cards";

const HERO_ITEM_IMAGES = [
  "/example-item1.webp",
  "/example-item2.webp",
  "/example-item3.webp",
  "/example-item4.webp",
  "/example-item5.webp",
] as const;

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const NAV_LINKS: readonly {
  readonly name: string;
  readonly href: string;
}[] = [
  { name: "Features", href: "#features" },
  { name: "FAQs", href: "#faqs" },
  { name: "Changelog", href: "/changelog" },
];

function HomeComponent() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-background text-foreground">
      {/* nav */}
      <header className="sticky top-0 z-30 w-full bg-background">
        <nav className="mx-auto flex h-12 w-full max-w-5xl items-center px-6 min-[940px]:grid min-[940px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[940px]:gap-4">
          <div />
          <div className="hidden min-[940px]:flex items-center gap-6">
            {NAV_LINKS.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {item.name}
              </a>
            ))}
          </div>

          <div className="ml-auto flex items-center justify-end gap-2 min-[940px]:ml-0">
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
            <ThemeToggle />
            <Button
              size="sm"
              className="rounded-lg"
              render={<Link to="/login" />}
              nativeButton={false}
            >
              Dashboard
            </Button>
          </div>
        </nav>
      </header>

      <main className="w-full">
        {/* Hero copy */}
        <section className="mx-auto w-full max-w-5xl px-6 pt-16 sm:pt-24">
          <div className="min-[1400px]:grid min-[1400px]:grid-cols-[minmax(0,1fr)_348px] min-[1400px]:items-center min-[1400px]:gap-7">
            <div className="min-w-0">
              <div className="animate-appear mb-6 flex items-center gap-3.5">
                <MyAkibaLogo size="full" className="block size-32" />
                <span className="hidden text-xs tracking-wide sm:block [&_span]:font-normal">
                  <TextLoop
                    preText="An alternative to"
                    texts={["MyFigureCollection's Manager", "DIY Spreadsheets"]}
                    interval={3500}
                  />
                </span>
              </div>

              <h1
                className="text-xl font-medium tracking-tight"
                aria-label="A modern anime figure collection manager"
              >
                <TyperHeadline
                  text="A modern anime figure collection manager"
                  delayMs={200}
                  aria-hidden
                />
              </h1>

              <p className="animate-appear mt-3 text-[15px] text-balance leading-normal text-muted-foreground [--appear-delay:400ms]">
                Your MyFigureCollection items and the flexibility of spreadsheets, unified into a
                modern collection manager.
              </p>

              <div className="animate-appear mt-5 flex flex-wrap items-center gap-3 [--appear-delay:460ms]">
                <Button
                  size="lg"
                  className="h-10 rounded-xl px-4"
                  render={<Link to="/signup" />}
                  nativeButton={false}
                >
                  Get started
                  <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
                </Button>
                <div className="px-2 text-start text-xs text-muted-foreground italic">
                  <p>*in early development</p>
                </div>{" "}
              </div>
            </div>

            <div className="hidden min-[1400px]:flex min-[1400px]:translate-y-6 min-[1400px]:justify-center">
              <BounceCards
                images={HERO_ITEM_IMAGES}
                containerWidth={240}
                containerHeight={120}
                cardSize={100}
                animationDelay={0.52}
                animationStagger={0.05}
                transformStyles={[
                  "rotate(10deg) translate(-108px)",
                  "rotate(5deg) translate(-54px)",
                  "rotate(-3deg)",
                  "rotate(-10deg) translate(54px)",
                  "rotate(3deg) translate(108px)",
                ]}
              />
            </div>
          </div>
        </section>

        <HeroShowcase isDark={isDark} />

        {/* panel gallery */}
        <section
          id="features"
          aria-label="myakiba features"
          className="mx-auto w-full max-w-5xl px-6 pt-16 pb-px"
        >
          <PanelGallery isDark={isDark} />
          <div className="mt-24 flex flex-col gap-24 sm:mt-32 sm:gap-32">
            <div className="animate-appear [--appear-delay:520ms]">
              <FeatureSplit
                appImage="collection"
                appImageAlt={`myakiba collection manager in ${isDark ? "dark" : "light"} mode`}
                backgroundCrop={{ scale: 170, x: -35, y: -8 }}
                bracketSide="left"
                description="Browse your collection in customizable table, card, and gallery views. Quickly search, filter, and edit prices, scores, shops, releases, and dates."
                isDark={isDark}
                mediaSide="right"
                title="Manage your collection"
              />
            </div>
            <div className="animate-appear [--appear-delay:520ms]">
              <FeatureSplit
                appImage="orders"
                appImageAlt={`myakiba order manager in ${isDark ? "dark" : "light"} mode`}
                backgroundCrop={{ scale: 170, x: -70, y: -8 }}
                bracketSide="left"
                description="Group multiple items into an order, follow it from Ordered to Owned, and track dates, shipping methods, item prices, and fees."
                isDark={isDark}
                mediaSide="left"
                title="Multi-item orders"
              />
            </div>
            <div className="animate-appear [--appear-delay:520ms]">
              <FeatureSplit
                appImage="analytics"
                appImageAlt={`myakiba collection analytics in ${isDark ? "dark" : "light"} mode`}
                backgroundCrop={{ scale: 170, x: -35, y: -8 }}
                bracketSide="left"
                description="Find your most-collected and highest-spend artists, characters, origins, companies, shops, scales, and more."
                isDark={isDark}
                mediaSide="right"
                title="See what shapes your collection"
              />
            </div>
            <div className="animate-appear [--appear-delay:520ms]">
              <FeatureSplit
                appImage="expenses"
                appImageAlt={`myakiba expense tracking in ${isDark ? "dark" : "light"} mode`}
                backgroundCrop={{ scale: 170, x: -70, y: -8 }}
                bracketSide="left"
                description="Explore collection, order, and shipping spend over time, with averages and breakdowns by category, fee, shop, and shipping method."
                isDark={isDark}
                mediaSide="left"
                title="See where your money goes"
              />
            </div>
          </div>
        </section>

        <div className="animate-appear [--appear-delay:520ms]">
          <FAQsSection />
        </div>
      </main>

      <div className="animate-appear [--appear-delay:520ms]">
        <FooterSection />
      </div>
    </div>
  );
}
