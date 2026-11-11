import type { ReactNode } from "react";
import { FramedScreen } from "@/components/homepage/framed-screen";
import { CELL_CARD, DemoLead, DemoStage, HomeSection } from "@/components/homepage/kit";
import type { HomeDemo } from "@/components/homepage/kit";
import { SceneSpill } from "@/components/homepage/window-light";
import { cn } from "@/lib/utils";

type Section = {
  readonly page: "collection" | "orders" | "analytics" | "expenses";
  readonly title: string;
  readonly description: string;
};

type CompactCard = HomeDemo & { readonly layout: "compact" };
type WideCard = HomeDemo & { readonly layout: "wide" };

const STAGE_INSET = { compact: "px-[22px] pb-[22px]", wide: "px-4 pb-4" } as const;

const LEAD = "max-w-sm text-lg font-medium text-balance text-muted-foreground";

function Screen({ page }: { readonly page: Section["page"] }) {
  return (
    <div className="overflow-hidden">
      <div className="max-sm:w-[40rem]">
        <FramedScreen name={page} className="relative overflow-hidden" />
      </div>
    </div>
  );
}

function Shell({ section, children }: { readonly section: Section; readonly children: ReactNode }) {
  const headingId = `${section.page}-title`;
  return (
    <HomeSection id={section.page} labelledBy={headingId} className="py-16 md:py-20">
      <h2
        id={headingId}
        className="max-w-4xl text-4xl font-medium tracking-tight text-balance text-muted-foreground"
      >
        <span className="text-foreground">{section.title}.</span> <br className="max-md:hidden" />
        {section.description}
      </h2>
      <div className="relative isolate mt-8 md:mt-12">
        <SceneSpill page={section.page} />
        {children}
      </div>
    </HomeSection>
  );
}

export function FrameSection({
  section,
  demos,
}: {
  readonly section: Section;
  readonly demos: readonly [HomeDemo] | readonly [HomeDemo, HomeDemo];
}) {
  return (
    <Shell section={section}>
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-background md:grid-cols-2">
        <div className="col-span-full border-b">
          <Screen page={section.page} />
        </div>
        {demos.length === 2 ? (
          demos.map((demo, i) => (
            <figure
              key={demo.title}
              className={cn(
                "row-span-2 grid min-w-0 grid-rows-subgrid gap-8 p-6 sm:p-12",
                i === 1 && "border-t md:border-t-0 md:border-l",
              )}
            >
              <figcaption>
                <p className={LEAD}>
                  <DemoLead demo={demo} />
                </p>
              </figcaption>
              <DemoStage demo={demo} layout="compact" />
            </figure>
          ))
        ) : (
          <figure className="col-span-full min-w-0">
            <figcaption className="max-w-lg px-6 pt-6 md:px-12 md:pt-12">
              <p className={LEAD}>
                <DemoLead demo={demos[0]} />
              </p>
            </figcaption>
            <div className="px-4 pt-8 pb-4 md:px-12 md:pb-12">
              <DemoStage demo={demos[0]} layout="wide" />
            </div>
          </figure>
        )}
      </div>
    </Shell>
  );
}

export function CardSection({
  section,
  cards,
}: {
  readonly section: Section;
  readonly cards: readonly [CompactCard, WideCard] | readonly [WideCard, CompactCard];
}) {
  return (
    <Shell section={section}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className={cn(CELL_CARD, "col-span-full")}>
          <Screen page={section.page} />
        </div>
        {cards.map((card) => (
          <figure
            key={card.title}
            className={cn(CELL_CARD, card.layout === "wide" && "lg:col-span-2")}
          >
            <figcaption className="p-8">
              <p className={LEAD}>
                <DemoLead demo={card} />
              </p>
            </figcaption>
            <div className={cn("mt-auto", STAGE_INSET[card.layout])}>
              <DemoStage demo={card} layout={card.layout} />
            </div>
          </figure>
        ))}
      </div>
    </Shell>
  );
}
