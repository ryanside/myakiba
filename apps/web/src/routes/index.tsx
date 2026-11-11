import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsExpandDemo } from "@/components/demos/analytics-expand";
import { CollectionLayoutsDemo } from "@/components/demos/collection-layouts";
import { CustomsFeesDemo } from "@/components/demos/customs-fees";
import { ExpensesScrubDemo } from "@/components/demos/expenses-scrub";
import { OrderCascadeDemo } from "@/components/demos/order-cascade";
import { OrderLifecycleDemo } from "@/components/demos/order-lifecycle";
import { ScoreCloseupDemo } from "@/components/demos/score-closeup";
import "@/components/demos/look.css";
import { Closing } from "@/components/homepage/closing";
import FAQsSection from "@/components/homepage/faqs";
import { HomeFooter } from "@/components/homepage/footer";
import { HomeHeader } from "@/components/homepage/header";
import { Hero } from "@/components/homepage/hero";
import { HowItWorks } from "@/components/homepage/how-it-works";
import { More } from "@/components/homepage/more";
import { CardSection, FrameSection } from "@/components/homepage/screen-section";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-background text-foreground">
      <HomeHeader />
      <main>
        <Hero />
        <HowItWorks />
        <FrameSection
          section={{
            page: "collection",
            title: "Collection",
            description: "Every item you own, and what you paid for it.",
          }}
          demos={[
            { Demo: CollectionLayoutsDemo, title: "Browse your collection the way you want" },
            {
              Demo: ScoreCloseupDemo,
              title: "Edit details in place",
              caption: "Prices, scores, counts, releases, shops and dates.",
            },
          ]}
        />
        <CardSection
          section={{
            page: "orders",
            title: "Orders",
            description: "Group what you bought together with its fees and dates.",
          }}
          cards={[
            {
              layout: "compact",
              Demo: OrderCascadeDemo,
              title: "Update an order once",
              caption: "Its items get the same status, shop, dates and shipping method.",
            },
            {
              layout: "wide",
              Demo: OrderLifecycleDemo,
              title: "Follow a preorder from Ordered to Owned",
            },
          ]}
        />
        <FrameSection
          section={{
            page: "analytics",
            title: "Analytics",
            description:
              "The artists, characters, origins and companies your collection comes from, by count and by spend.",
          }}
          demos={[
            {
              Demo: AnalyticsExpandDemo,
              title: "Open any artist, character, origin or company",
              caption: "See everything you own from them.",
            },
          ]}
        />
        <CardSection
          section={{
            page: "expenses",
            title: "Expenses",
            description: "What you’ve spent, and what’s still unpaid.",
          }}
          cards={[
            {
              layout: "wide",
              Demo: ExpensesScrubDemo,
              title: "See where your money has gone",
              caption: "By month, shop, category and shipping method.",
            },
            {
              layout: "compact",
              Demo: CustomsFeesDemo,
              title: "Add fees as they come in",
              caption: "Customs, shipping and taxes count toward what you’ve spent.",
            },
          ]}
        />
        <More />
        <Closing />
        <FAQsSection />
      </main>
      <HomeFooter />
    </div>
  );
}
