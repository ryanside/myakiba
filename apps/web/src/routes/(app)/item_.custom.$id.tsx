import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Package01Icon } from "@hugeicons/core-free-icons";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
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
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Package01Icon} />
          </EmptyMedia>
          <EmptyTitle>Custom items are on the way</EmptyTitle>
          <EmptyDescription>
            Managing items outside of MyFigureCollection isn&apos;t available yet. We&apos;re
            working on it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="default" onClick={() => toast.info("Custom items coming soon")}>
            <HugeiconsIcon icon={Add01Icon} />
            Add custom item
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
