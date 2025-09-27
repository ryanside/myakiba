import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)/gallery")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/gallery"!</div>;
}
