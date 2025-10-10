import { createFileRoute } from "@tanstack/react-router";
import HeroSection from "@/components/homepage/hero-section";

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
    <HeroSection />
  );
}
