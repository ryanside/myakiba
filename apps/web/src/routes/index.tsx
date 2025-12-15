import { createFileRoute } from "@tanstack/react-router";
import { HeroHeader } from "@/components/homepage/header";
import HeroSection from "@/components/homepage/hero-section";
import HeroBackgroundImage from "/hero-bg.webp";
import FooterSection from "@/components/homepage/footer";
import Feature from "@/components/homepage/feature";
import FeatureBackground1 from "/feature-bg1.webp";
import FeatureBackground2 from "/feature-bg2.webp";
import FeatureBackground3 from "/feature-bg3.webp";
import AnalyticsDarkImage from "/analytics-dark.webp";
import AnalyticsLightImage from "/analytics-light.webp";
import CollectionDarkImage from "/collection-dark.webp";
import CollectionLightImage from "/collection-light.webp";
import DashboardDarkImage from "/dashboard-dark.webp";
import DashboardLightImage from "/dashboard-light.webp";
import OrdersDarkImage from "/orders-dark.webp";
import OrdersLightImage from "/orders-light.webp";
import ExampleItemImage1 from "/example-item1.jpg";
import ExampleItemImage2 from "/example-item2.jpg";
import ExampleItemImage3 from "/example-item3.jpg";
import ExampleItemImage4 from "/example-item4.jpg";
import ExampleItemImage5 from "/example-item5.jpg";
import ExampleItemImage6 from "/example-item6.jpg";
import ExampleItemImage7 from "/example-item7.jpg";
import CallToAction from "@/components/homepage/call-to-action";
import FAQs from "@/components/homepage/faqs";
import LogoCloud from "@/components/logo-cloud";
import { useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "collection manager for japanese goods collectors",
      },
      {
        title: "Home — myakiba",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
    scripts: [],
  }),
});

function HomeComponent() {
  const { theme } = useTheme();

  return (
    <>
      <HeroHeader />
      <HeroSection
        heroImage={theme !== "light" ? DashboardDarkImage : DashboardLightImage}
        heroBackgroundImage={HeroBackgroundImage}
      />
      <LogoCloud
        images={[
          ExampleItemImage1,
          ExampleItemImage2,
          ExampleItemImage3,
          ExampleItemImage4,
          ExampleItemImage5,
          ExampleItemImage6,
          ExampleItemImage7,
        ]}
      />
      <section id="features" className="mx-auto">
        <Feature
          imageOrientation="right"
          backgroundImage={FeatureBackground1}
          featureImage={
            theme !== "light" ? AnalyticsDarkImage : AnalyticsLightImage
          }
          title="Analytics of your collection"
          description="Get insights into your collection with detailed analytics."
          link="/login"
          linkText="View your analytics"
        />
        <Feature
          imageOrientation="left"
          backgroundImage={FeatureBackground2}
          featureImage={theme !== "light" ? OrdersDarkImage : OrdersLightImage}
          title="Track your orders"
          description="Manage pre-orders, track shipments, and monitor order status."
          link="/login"
          linkText="Start tracking"
        />
        <Feature
          imageOrientation="right"
          backgroundImage={FeatureBackground3}
          featureImage={
            theme !== "light" ? CollectionDarkImage : CollectionLightImage
          }
          title="Manage your collection"
          description="Track your collection with item information from MyFigureCollection."
          link="/login"
          linkText="Import your collection"
        />
      </section>
      <FAQs />
      <CallToAction />
      <FooterSection />
    </>
  );
}
