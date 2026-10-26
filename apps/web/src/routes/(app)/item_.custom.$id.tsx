import { PackageMovingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { BackLink } from "@/components/ui/back-link";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const Route = createFileRoute("/(app)/item_/custom/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      { name: "description", content: `Custom item ${params.id} details` },
      { title: `Custom item - myakiba` },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-6 mx-auto max-w-[88rem]">
      <BackLink fallbackTo="/collection" text="Back" font="sans" className="self-start" />
      <Empty className={STATE_PANEL_CLASS_NAME}>
        <EmptyHeader>
          <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
            <HugeiconsIcon icon={PackageMovingIcon} className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Custom items are on the way</EmptyTitle>
          <EmptyDescription>
            Managing items outside of MyFigureCollection isn&apos;t available yet. We&apos;re
            working on it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
