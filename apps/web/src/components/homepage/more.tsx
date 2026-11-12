import { CommandMenuDemo } from "@/components/demos/command-menu";
import { ListAnythingDemo } from "@/components/demos/list-anything";
import { ReleaseCalendarDemo } from "@/components/demos/release-calendar";
import { WishlistRankDemo } from "@/components/demos/wishlist-rank";
import { CARD, DemoLead, DemoStage, HomeSection } from "@/components/homepage/kit";
import type { HomeDemo } from "@/components/homepage/kit";
import { cn } from "@/lib/utils";

const MORE: readonly HomeDemo[] = [
  {
    title: "A wishlist you arrange yourself",
    Demo: WishlistRankDemo,
  },
  {
    title: "A calendar of your releases",
    Demo: ReleaseCalendarDemo,
  },
  {
    title: "Lists that hold items, orders and what you own",
    Demo: ListAnythingDemo,
  },
  {
    title: "Search with ⌘K",
    caption: "Jump to any page, order or item you own.",
    Demo: CommandMenuDemo,
  },
];

export function More() {
  return (
    <HomeSection id="more" labelledBy="more-title" className="py-16 md:py-20">
      <h2 id="more-title" className="max-w-4xl text-4xl font-medium tracking-tight text-balance">
        Also in myakiba.
      </h2>
      <div className="mt-8 grid gap-x-3 gap-y-10 md:mt-16 md:grid-cols-2">
        {MORE.map((demo) => (
          <figure key={demo.title} className="row-span-2 grid grid-rows-subgrid gap-4">
            <div
              className={cn(
                CARD,
                "flex items-center justify-center overflow-hidden p-4 sm:p-8 lg:p-12",
              )}
            >
              <DemoStage demo={demo} layout="compact" />
            </div>
            <figcaption className="text-balance text-muted-foreground">
              <DemoLead demo={demo} />
            </figcaption>
          </figure>
        ))}
      </div>
    </HomeSection>
  );
}
