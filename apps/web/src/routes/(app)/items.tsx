import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { itemDatabaseSearchSchema } from "@myakiba/contracts/search/schema";
import { DEFAULT_PAGE_SIZE } from "@myakiba/contracts/shared/constants";
import { ItemDatabase } from "@/components/item-database/item-database";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="mb-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-medium tracking-tight">Item Database</h1>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="About the item database"
                  className="mt-0.75"
                >
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="right" sideOffset={12}>
              <div className="flex max-w-xs flex-col gap-1">
                <h3 className="text-sm font-medium">dev note:</h3>
                <p className="text-pretty">
                  This is an early, simple version of the Item Database.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ItemDatabase />
    </div>
  );
}
