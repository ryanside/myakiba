import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)/sync")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
