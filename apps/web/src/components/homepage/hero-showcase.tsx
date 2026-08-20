import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const HERO_VIEWS = [
  {
    id: "dashboard",
    label: "Dashboard",
    image: "dashboard",
    alt: "myakiba dashboard overview",
  },
  {
    id: "collection",
    label: "Collection",
    image: "collection",
    alt: "myakiba collection manager",
  },
  {
    id: "orders",
    label: "Orders",
    image: "orders",
    alt: "myakiba order manager",
  },
  {
    id: "analytics",
    label: "Analytics",
    image: "analytics",
    alt: "myakiba collection analytics",
  },
  {
    id: "expenses",
    label: "Expenses",
    image: "expenses",
    alt: "myakiba expense tracking",
  },
] as const;

type HeroViewId = (typeof HERO_VIEWS)[number]["id"];
type HeroViewDirection = "next" | "previous";

type HeroShowcaseProps = {
  readonly isDark: boolean;
};

export function HeroShowcase({ isDark }: HeroShowcaseProps) {
  const [heroView, setHeroView] = useState<HeroViewId>("dashboard");
  const [heroViewDirection, setHeroViewDirection] = useState<HeroViewDirection>("next");
  const [animateHeroViewChange, setAnimateHeroViewChange] = useState(true);
  const heroViewIndex = HERO_VIEWS.findIndex((view) => view.id === heroView);
  const activeHeroView = HERO_VIEWS[heroViewIndex];
  const previousHeroView = HERO_VIEWS[(heroViewIndex - 1 + HERO_VIEWS.length) % HERO_VIEWS.length];
  const nextHeroView = HERO_VIEWS[(heroViewIndex + 1) % HERO_VIEWS.length];

  return (
    <section
      className="mt-20 mb-10 animate-appear overflow-hidden [--appear-delay:520ms]"
      aria-label="Explore myakiba"
    >
      <Tabs
        value={heroView}
        onValueChange={(value, eventDetails) => {
          const isKeyboardActivation =
            eventDetails.event instanceof KeyboardEvent ||
            (eventDetails.event instanceof MouseEvent && eventDetails.event.detail === 0);

          setHeroViewDirection(eventDetails.activationDirection === "left" ? "previous" : "next");
          setAnimateHeroViewChange(!isKeyboardActivation);
          setHeroView(value as HeroViewId);
        }}
        className="relative w-screen gap-0 overflow-hidden pt-20 pb-8 md:pt-28 md:pb-20"
      >
        <img
          src={isDark ? "/hero-bg-dark.webp" : "/hero-bg-light.webp"}
          alt=""
          className="absolute inset-0 size-full object-cover object-center select-none"
          fetchPriority="high"
          draggable={false}
        />
        <div className="absolute inset-x-0 top-0 z-20 flex justify-center">
          <div className="relative flex h-13 items-center rounded-b-[2rem] bg-background px-5 md:items-start">
            <div
              aria-hidden="true"
              className="absolute top-0 -left-[31px] size-8"
              style={{
                background:
                  "radial-gradient(circle at 0% 100%, transparent 32px, var(--color-background) 32.5px)",
              }}
            />
            <div
              aria-hidden="true"
              className="absolute top-0 -right-[31px] size-8"
              style={{
                background:
                  "radial-gradient(circle at 100% 100%, transparent 32px, var(--color-background) 32.5px)",
              }}
            />

            <TabsList
              aria-label="Product views"
              className="hidden h-auto rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto md:contents"
            >
              {HERO_VIEWS.map((view) => (
                <TabsTrigger
                  key={view.id}
                  value={view.id}
                  className="h-9 flex-none rounded-full border-transparent px-3 py-0 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground data-active:border-transparent data-active:bg-foreground/5 data-active:text-foreground data-active:shadow-none! dark:data-active:border-transparent dark:data-active:bg-foreground/5"
                >
                  {view.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex items-center gap-3 md:hidden">
              <button
                type="button"
                aria-label={`Previous product view: ${previousHeroView.label}`}
                className="relative flex size-6 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition-colors duration-150 after:absolute after:-inset-2.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                onClick={(event) => {
                  setHeroViewDirection("previous");
                  setAnimateHeroViewChange(event.detail !== 0);
                  setHeroView(previousHeroView.id);
                }}
              >
                <svg aria-hidden="true" className="mr-px size-4" fill="none" viewBox="0 0 16 16">
                  <path
                    d="M10 12 6 8l4-4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  />
                </svg>
              </button>
              <span
                aria-live="polite"
                className="w-24 text-center text-sm font-medium text-foreground"
              >
                {activeHeroView.label}
              </span>
              <button
                type="button"
                aria-label={`Next product view: ${nextHeroView.label}`}
                className="relative flex size-6 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition-colors duration-150 after:absolute after:-inset-2.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                onClick={(event) => {
                  setHeroViewDirection("next");
                  setAnimateHeroViewChange(event.detail !== 0);
                  setHeroView(nextHeroView.id);
                }}
              >
                <svg aria-hidden="true" className="ml-px size-4" fill="none" viewBox="0 0 16 16">
                  <path
                    d="m6 12 4-4-4-4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-5xl px-5">
          <div
            className={cn(
              "relative isolate aspect-2992/1788 w-full overflow-hidden rounded-md shadow-sm",
              isDark ? "bg-[#090909]" : "bg-white",
            )}
          >
            {HERO_VIEWS.map((view) => (
              <TabsContent
                key={view.id}
                value={view.id}
                data-slide-direction={heroViewDirection}
                className={cn(
                  "absolute inset-0 size-full opacity-100 [transform:translateX(0)]",
                  animateHeroViewChange && [
                    "transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:opacity-0",
                    "data-[slide-direction=next]:data-ending-style:[transform:translateX(-2%)] data-[slide-direction=next]:data-starting-style:[transform:translateX(2%)]",
                    "data-[slide-direction=previous]:data-ending-style:[transform:translateX(2%)] data-[slide-direction=previous]:data-starting-style:[transform:translateX(-2%)]",
                    "motion-reduce:data-ending-style:[transform:none] motion-reduce:data-starting-style:[transform:none]",
                  ],
                )}
              >
                <img
                  src={`/${view.image}-${isDark ? "dark" : "light"}.webp`}
                  alt={`${view.alt} in ${isDark ? "dark" : "light"} mode`}
                  width={2992}
                  height={1788}
                  className="block size-full select-none object-cover"
                  draggable={false}
                  loading={view.id === "dashboard" ? "eager" : "lazy"}
                  fetchPriority={view.id === "dashboard" ? "high" : "auto"}
                />
              </TabsContent>
            ))}
          </div>
        </div>
      </Tabs>
    </section>
  );
}
