import { createFileRoute } from "@tanstack/react-router";
import { HeroHeader } from "@/components/homepage/header";
import HeroSection from "@/components/homepage/hero-section";
import Features from "@/components/homepage/features";
import FooterSection from "@/components/homepage/footer";

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
      <Features />
      <FooterSection />
    </>
  );
}
