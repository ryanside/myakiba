import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MyAkibaLogo } from "@/components/myakiba-logo";
import { TextLoop } from "@/components/homepage/text-loop";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Sun01Icon, Moon02Icon } from "@hugeicons/core-free-icons";
import { useTheme } from "next-themes";
import MfcSyncSection from "@/components/homepage/integrations-1";
import FAQsSection from "@/components/homepage/faqs";
import FooterSection from "@/components/homepage/footer";
import LogoCloud from "@/components/homepage/logo-cloud";

const EXAMPLE_ITEMS = [
  "/example-item1.jpg",
  "/example-item2.jpg",
  "/example-item3.jpg",
  "/example-item4.jpg",
  "/example-item5.jpg",
  "/example-item6.jpg",
  "/example-item7.jpg",
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
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
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
        <div className="flex items-center gap-3.5 mb-6">
          <MyAkibaLogo size="full" className="size-32 block" />
          <span className="hidden sm:block text-xs tracking-wide [&_span]:font-normal">
            <TextLoop
              preText="An alternative to"
              texts={["MyFigureCollection's Manager", "DIY Spreadsheets"]}
              interval={3500}
            />
          </span>
        </div>

        <h1 className="text-xl font-medium tracking-tight">
          A modern anime figure collection manager
        </h1>

        <p className="mt-3 text-[15px] leading-normal text-muted-foreground">
          Your MyFigureCollection catalog and the flexibility of spreadsheets, unified into a modern
          collection manager. Track orders, analyze your collection, and sync with MFC.
        </p>

        <div className="mt-5 mb-7 flex flex-wrap items-center gap-3">
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
            <p>*in early development, screenshots below may be outdated</p>
          </div>{" "}
        </div>

        <section id="features" className="mb-12">
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

        <div className="-mx-6 sm:-mx-24 md:-mx-36 lg:-mx-60 xl:-mx-84">
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

          <img
            key={`${activeTab}-${isDark}`}
            src={getHeroImage(activeTab, isDark)}
            alt={`myakiba ${activeTab}`}
            className="w-full rounded-xl"
            loading="eager"
            fetchPriority="high"
          />

          <LogoCloud images={EXAMPLE_ITEMS} />
        </div>
      </main>

      <MfcSyncSection />
      <FAQsSection />
      <FooterSection />
    </div>
  );
}
