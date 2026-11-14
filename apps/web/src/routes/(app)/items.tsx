import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { itemDatabaseSearchSchema } from "@myakiba/contracts/search/schema";
import { DEFAULT_PAGE_SIZE } from "@myakiba/contracts/shared/constants";
import { ItemDatabase } from "@/components/item-database/item-database";
import { preload, preloadPage } from "@/data/client";
import { searches } from "@/data/resources/search";

export const Route = createFileRoute("/(app)/items")({
  component: RouteComponent,
  validateSearch: itemDatabaseSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, cause, deps }) =>
    preloadPage(cause, () => [preload(queryClient, searches.itemDatabase, deps)]),
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
    <div className="mx-auto flex max-w-[88rem] flex-col gap-6">
      <ItemDatabase />
    </div>
  );
}
