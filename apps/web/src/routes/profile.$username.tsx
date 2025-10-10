import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/profile/$username")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `${params.username}'s myakiba profile`,
      },
      {
        title: `${params.username} — myakiba`,
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

function RouteComponent() {
  return <div>Hello "/profile/$username"!</div>;
}
