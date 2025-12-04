import { createFileRoute } from "@tanstack/react-router";
import { HeroHeader } from "@/components/homepage/header";
import HeroSection from "@/components/homepage/hero-section";
import FooterSection from "@/components/homepage/footer";
import Feature from "@/components/homepage/feature";
import FeatureBackground1 from "/feature-bg1.webp";
import FeatureBackground2 from "/feature-bg2.webp";
import FeatureBackground3 from "/feature-bg3.webp";
import analytics from "/analytics.webp";
import collection from "/collection.webp";
import orders from "/orders.webp";
import CallToAction from "@/components/homepage/call-to-action";
import FAQs from "@/components/homepage/faqs";
import LogoCloud from "@/components/logo-cloud";

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
  return (
    <>
      <HeroHeader />
      <HeroSection />
      <LogoCloud />
      <section id="features" className="mx-auto">
        <Feature
          imageOrientation="right"
          backgroundImage={FeatureBackground1}
          featureImage={analytics}
          title="Analytics of your collection"
          description="Get insights into your collection with detailed analytics."
          link="/login"
          linkText="Get started"
        />
        <Feature
          imageOrientation="left"
          backgroundImage={FeatureBackground2}
          featureImage={orders}
          title="Manage your orders"
          description="Track your orders and receive notifications when your items are shipped."
          link="/login"
          linkText="Get started"
        />
        <Feature
          imageOrientation="right"
          backgroundImage={FeatureBackground3}
          featureImage={collection}
          title="Manage your collection"
          description="Add, edit, and delete items from your collection."
          link="/login"
          linkText="Get started"
        />
      </section>
      <FAQs />
      <CallToAction />
      <FooterSection />
    </>
  );
}
