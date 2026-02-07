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

const LOGO_CLOUD_IMAGES: readonly string[] = [
  ExampleItemImage1,
  ExampleItemImage2,
  ExampleItemImage3,
  ExampleItemImage4,
  ExampleItemImage5,
  ExampleItemImage6,
  ExampleItemImage7,
];

type FeatureSection = {
  readonly imageOrientation: "left" | "right";
  readonly backgroundImage: string;
  readonly featureImage: { readonly light: string; readonly dark: string };
  readonly title: string;
  readonly description: string;
};

const FEATURE_SECTIONS: readonly FeatureSection[] = [
  {
    imageOrientation: "right",
    backgroundImage: FeatureBackground1,
    featureImage: { dark: AnalyticsDarkImage, light: AnalyticsLightImage },
    title: "Analytics of your collection",
    description: "Get insights into your collection with detailed analytics.",
  },
  {
    imageOrientation: "left",
    backgroundImage: FeatureBackground2,
    featureImage: { dark: OrdersDarkImage, light: OrdersLightImage },
    title: "Track your orders",
    description: "Manage pre-orders, track shipments, and monitor order status.",
  },
  {
    imageOrientation: "right",
    backgroundImage: FeatureBackground3,
    featureImage: { dark: CollectionDarkImage, light: CollectionLightImage },
    title: "Manage your collection",
    description: "Track your collection with item information from MyFigureCollection.",
  },
];

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { theme } = useTheme();
  const isDarkTheme = theme !== "light";

  return (
    <>
      <HeroHeader />
      <HeroSection
        heroImage={isDarkTheme ? DashboardDarkImage : DashboardLightImage}
        heroBackgroundImage={HeroBackgroundImage}
      />
      <LogoCloud images={LOGO_CLOUD_IMAGES} />
      <section id="features" className="mx-auto">
        {FEATURE_SECTIONS.map((feature) => (
          <Feature
            key={feature.title}
            imageOrientation={feature.imageOrientation}
            backgroundImage={feature.backgroundImage}
            featureImage={isDarkTheme ? feature.featureImage.dark : feature.featureImage.light}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </section>
      <FAQs />
      <CallToAction />
      <FooterSection />
    </>
  );
}
