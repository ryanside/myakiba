import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { TextLoop } from "@/components/homepage/text-loop";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Sun01Icon, Moon02Icon } from "@hugeicons/core-free-icons";
import { useTheme } from "next-themes";
import BounceCards from "@/components/BounceCards";
import MfcSyncSection from "@/components/homepage/integrations-1";
import FAQsSection from "@/components/homepage/faqs";
import FooterSection from "@/components/homepage/footer";
import LogoCloud from "@/components/homepage/logo-cloud";
import { cn } from "@/lib/utils";

const EXAMPLE_ITEMS = [
  "/example-item1.webp",
  "/example-item2.webp",
  "/example-item3.webp",
  "/example-item4.webp",
  "/example-item5.webp",
  "/example-item6.webp",
  "/example-item7.webp",
] as const;

const HERO_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "orders", label: "Orders" },
  { id: "collection", label: "Collection" },
  { id: "analytics", label: "Analytics" },
] as const;

type HeroTabId = (typeof HERO_TABS)[number]["id"];

function getHeroImage(tab: HeroTabId, isDark: boolean): string {
  return `/${tab}-${isDark ? "dark" : "light"}.webp`;
}

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const NAV_LINKS: readonly {
  readonly name: string;
  readonly href: string;
  readonly external?: boolean;
}[] = [
  { name: "Features", href: "#features" },
  { name: "FAQs", href: "#faqs" },
  { name: "Discord", href: "https://discord.gg/VKHVvhcC2z", external: true },
  { name: "Github", href: "https://github.com/ryanside/myakiba", external: true },
];

type Feature = {
  readonly label: string;
  readonly description: string;
};

const FEATURES: readonly Feature[] = [
  {
    label: "MFC sync",
    description: "import MyFigureCollection items directly into myakiba",
  },
  {
    label: "Order tracking",
    description: "multi-item orders with detailed costs, statuses, and dates",
  },
  {
    label: "Analytics",
    description: "see which characters, series, companies, and more shape your collection",
  },
  {
    label: "Collection management",
    description: "organize, filter, and search your figures with ease",
  },
  {
    label: "More than a spreadsheet",
    description: "flexible views, inline editing, and real item data",
  },
  {
    label: "Dashboard",
    description: "at-a-glance view of your collection, orders, releases, and spending",
  },
  {
    label: "Open source",
    description: "open source and community-driven",
  },
  {
    label: "Coming soon",
    description: "profile page, expense tracking, and more",
  },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme !== "light";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <HugeiconsIcon icon={isDark ? Sun01Icon : Moon02Icon} />
    </Button>
  );
}

function HomeComponent() {
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const [activeTab, setActiveTab] = useState<HeroTabId>("dashboard");

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-30 w-full bg-background">
        <nav className="mx-auto flex h-12 max-w-6xl items-center px-6 min-[940px]:grid min-[940px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[940px]:gap-4">
          <div />
          <div className="hidden min-[940px]:flex items-center gap-6">
            {NAV_LINKS.map((item) => {
              const linkClass =
                "text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground";
              return item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {item.name}
                </a>
              ) : (
                <a key={item.name} href={item.href} className={linkClass}>
                  {item.name}
                </a>
              );
            })}
          </div>

          <div className="ml-auto flex items-center justify-end gap-2 min-[940px]:ml-0">
            <ThemeToggle />
            <Button
              size="sm"
              className="rounded-lg"
              render={<Link to="/login" />}
              nativeButton={false}
            >
              Login
            </Button>
          </div>
        </nav>
      </header>

      <main className="w-full max-w-2xl mx-auto px-6 pt-16 sm:pt-24 pb-8">
        <div className="animate-appear flex items-center gap-3.5 mb-6">
          <MyAkibaLogo size="full" className="size-32 block" />
          <span className="hidden sm:block text-xs tracking-wide [&_span]:font-normal">
            <TextLoop
              preText="An alternative to"
              texts={["MyFigureCollection's Manager", "DIY Spreadsheets"]}
              interval={3500}
            />
          </span>
        </div>

        <h1 className="animate-appear text-xl font-medium tracking-tight [--appear-delay:80ms]">
          A modern anime figure collection manager
        </h1>

        <p className="animate-appear mt-3 text-[15px] leading-normal text-muted-foreground [--appear-delay:140ms]">
          Your MyFigureCollection catalog and the flexibility of spreadsheets, unified into a modern
          collection manager. Track orders, analyze your collection, and sync with MFC.
        </p>

        <div className="animate-appear mt-5 mb-7 flex flex-wrap items-center gap-3 [--appear-delay:200ms]">
          <Button
            size="lg"
            className="h-10 rounded-xl px-4"
            render={<Link to="/login" />}
            nativeButton={false}
          >
            Get started
            <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
          </Button>
          <div className="px-2 text-start text-xs text-muted-foreground italic">
            <p>*in early development</p>
          </div>{" "}
        </div>

        <div className="animate-appear flex justify-start my-2 [--appear-delay:240ms]">
          <BounceCards
            images={[...EXAMPLE_ITEMS].slice(0, 5)}
            containerWidth={240}
            containerHeight={120}
            cardSize={70}
            animationDelay={0.3}
            transformStyles={[
              "rotate(10deg) translate(-76px)",
              "rotate(5deg) translate(-38px)",
              "rotate(-3deg)",
              "rotate(-10deg) translate(38px)",
              "rotate(2deg) translate(76px)",
            ]}
          />
        </div>

        <section id="features" className="animate-appear mb-12 [--appear-delay:300ms]">
          <h2 className="text-xs font-medium text-muted-foreground tracking-tight mb-4">
            Features
          </h2>
          <ul className="space-y-3 text-sm">
            {FEATURES.map((feature) => (
              <li key={feature.label} className="flex items-baseline gap-3">
                <span className="select-none text-muted-foreground">–</span>
                <span>
                  <span className="font-semibold text-foreground">{feature.label}</span>
                  <span className="text-muted-foreground">: {feature.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="animate-appear -mx-6 sm:-mx-24 md:-mx-36 lg:-mx-60 xl:-mx-84 [--appear-delay:380ms]">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as HeroTabId)}
            className="mb-3"
          >
            <TabsList variant="line" className="px-6 sm:px-0">
              {HERO_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="relative aspect-2992/1788 w-full overflow-hidden rounded-xl">
            {HERO_TABS.map((tab) => (
              <img
                key={tab.id}
                src={getHeroImage(tab.id, isDark)}
                alt={`myakiba ${tab.id}`}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover transition-opacity duration-150",
                  tab.id === activeTab ? "opacity-100" : "opacity-0",
                )}
                loading="eager"
              />
            ))}
          </div>

          <LogoCloud images={EXAMPLE_ITEMS} />
        </div>
      </main>

      <div className="animate-appear [--appear-delay:460ms]">
        <MfcSyncSection />
      </div>
      <div className="animate-appear [--appear-delay:520ms]">
        <FAQsSection />
      </div>
      <div className="animate-appear [--appear-delay:560ms]">
        <FooterSection />
      </div>
    </div>
  );
}
