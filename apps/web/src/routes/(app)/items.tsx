import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { itemDatabaseSearchSchema } from "@myakiba/contracts/search/schema";
import { DEFAULT_PAGE_SIZE } from "@myakiba/contracts/shared/constants";
import { ItemDatabase } from "@/components/item-database/item-database";

export const Route = createFileRoute("/(app)/items")({
  component: RouteComponent,
  validateSearch: itemDatabaseSearchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: DEFAULT_PAGE_SIZE })],
  },
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Search the MyAkiba item database",
      },
      {
        title: "Item Database - myakiba",
      },
    ],
  }),
});

function RouteComponent(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <ItemDatabase />
    </div>
  );
}
