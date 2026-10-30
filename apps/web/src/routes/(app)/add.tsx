import { createFileRoute } from "@tanstack/react-router";
import { AddPage } from "@/components/add/add-page";
import { addSearchSchema } from "@/lib/add-search";

export const Route = createFileRoute("/(app)/add")({
  validateSearch: addSearchSchema,
  component: RouteComponent,
  head: () => ({
    meta: [
      { name: "description", content: "Choose where your picked items go" },
      { title: "Add items - myakiba" },
    ],
  }),
});

function RouteComponent() {
  return <AddPage search={Route.useSearch()} />;
}
