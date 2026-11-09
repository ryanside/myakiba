import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { AnalyticsExpandDemo } from "@/components/demos/analytics-expand";
import { CollectionLayoutsDemo } from "@/components/demos/collection-layouts";
import { CommandMenuDemo } from "@/components/demos/command-menu";
import { CustomsFeesDemo } from "@/components/demos/customs-fees";
import { ExpensesScrubDemo } from "@/components/demos/expenses-scrub";
import { FeatureBentoDemo } from "@/components/demos/feature-bento";
import { ItemWishlistDemo } from "@/components/demos/item-wishlist";
import { ListAnythingDemo } from "@/components/demos/list-anything";
import { MergeOrdersDemo } from "@/components/demos/merge-orders";
import { OrderBoardDemo } from "@/components/demos/order-board";
import { OrderCascadeDemo } from "@/components/demos/order-cascade";
import { OrderLifecycleDemo } from "@/components/demos/order-lifecycle";
import { OrderPriceDemo } from "@/components/demos/order-price";
import { PickToAddDemo } from "@/components/demos/pick-to-add";
import { ReleaseCalendarDemo } from "@/components/demos/release-calendar";
import { ReleaseDelayDemo } from "@/components/demos/release-delay";
import { ScoreCloseupDemo } from "@/components/demos/score-closeup";
import { SplitShipmentDemo } from "@/components/demos/split-shipment";
import { WishlistRankDemo } from "@/components/demos/wishlist-rank";
import "@/components/demos/look.css";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/demos")({
  head: () => ({
    meta: [
      { title: "Demos - myakiba" },
      { name: "description", content: "Small looping demos of myakiba" },
      // Unlinked until the homepage picks its demos; drop this to let it be indexed.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DemosPage,
});

function DemosPage() {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-background text-foreground">
      <main className="mx-auto w-full max-w-[60rem] px-4 pt-16 pb-32 sm:px-6 sm:pt-24">
        <header className="mx-auto max-w-[38rem]">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              myakiba
            </Link>
            <ThemeToggle />
          </div>
          <h1 className="mt-10 text-xl font-medium tracking-tight">In motion</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What myakiba does, a few seconds at a time.
          </p>
        </header>

        <div className="mt-20 flex flex-col gap-24 sm:gap-32">
          <DemoSection
            id="demo-pick-to-add"
            title="Pick it, then place it"
            caption="Pick a figure on MyFigureCollection, then choose where it goes."
          >
            <PickToAddDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-order-board"
            title="Orders that arrive"
            caption="An order moves from Shipped to Owned, and its items join the collection."
          >
            <OrderBoardDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-order-cascade"
            title="Items follow their order"
            caption="Change an order's status, and every item in it changes with it."
          >
            <OrderCascadeDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-order-price"
            title="Totals that keep up"
            caption="Correct an item's price, and the order's cost breakdown follows."
          >
            <OrderPriceDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-analytics-expand"
            title="What shapes your collection"
            caption="Open an artist to see what you own of theirs and who they drew."
          >
            <AnalyticsExpandDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-expenses-scrub"
            title="Where the money went"
            caption="Spend over time, month by month."
          >
            <ExpensesScrubDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-collection-layouts"
            title="Your collection, your way"
            caption="Switch from a table to a gallery, and the same figures fill the space."
          >
            <CollectionLayoutsDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-release-calendar"
            title="What's releasing"
            caption="Pick release days on the calendar, and the list narrows to them."
          >
            <ReleaseCalendarDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-wishlist-rank"
            title="A wishlist in your order"
            caption="Drag a figure to the front of your wishlist."
          >
            <WishlistRankDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-command-menu"
            title="Anywhere in a keystroke"
            caption="Press ⌘K and type to jump straight to an order."
          >
            <CommandMenuDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-merge-orders"
            title="Two orders become one"
            caption="Select two orders and merge them, items and all."
          >
            <MergeOrdersDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-order-lifecycle"
            title="From preorder to shelf"
            caption="Months of one preorder, from the day it's ordered to the day it's owned."
          >
            <OrderLifecycleDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-release-delay"
            title="When a release slips"
            caption="Pick the delayed release, and the order's release date moves with it."
          >
            <ReleaseDelayDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-list-anything"
            title="Lists that hold anything"
            caption="Items, collection items and whole orders, together in one List."
          >
            <ListAnythingDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-feature-bento"
            title="Everything at a glance"
            caption="Releases, spend, shipping and status, each in its own tile."
          >
            <FeatureBentoDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-customs-fees"
            title="Customs, counted"
            caption="Add the duties and tariffs when the bill arrives, and they land in your spend."
          >
            <CustomsFeesDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-split-shipment"
            title="When a shop splits a shipment"
            caption="Move an item into its own order, and both totals follow."
          >
            <SplitShipmentDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-item-wishlist"
            title="Every figure, catalogued"
            caption="Find a figure in the Item Database and star it for later."
          >
            <ItemWishlistDemo theme={theme} />
          </DemoSection>
          <DemoSection
            id="demo-score-closeup"
            title="Rate what you own"
            caption="Score a figure out of ten, right in the table."
          >
            <ScoreCloseupDemo theme={theme} />
          </DemoSection>
        </div>
      </main>
    </div>
  );
}

function DemoSection({
  id,
  title,
  caption,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly caption: string;
  readonly children: ReactNode;
}) {
  const headingId = `${id}-title`;

  return (
    <section aria-labelledby={headingId}>
      <div className="mx-auto flex max-w-[38rem] items-center gap-4">
        <h2 id={headingId} className="shrink-0 text-[15px] font-medium tracking-tight">
          {title}
        </h2>
        <div aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <figure className="mt-10">
        <div id={id}>{children}</div>
        <figcaption className="mx-auto mt-5 max-w-[38rem] text-center text-[13px] text-muted-foreground">
          {caption}
        </figcaption>
      </figure>
    </section>
  );
}
