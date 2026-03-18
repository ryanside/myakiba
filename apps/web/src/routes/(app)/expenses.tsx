import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon } from "@hugeicons/core-free-icons";

export const Route = createFileRoute("/(app)/expenses")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: "description",
        content: `your expenses`,
      },
      {
        title: `Expenses - myakiba`,
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="flex-1 gap-y-4 p-4 md:p-8 pt-6">
      <div className="rounded-lg border border-dashed p-8">
        <div className="flex flex-col items-center justify-center gap-y-4 text-center">
          <HugeiconsIcon icon={CodeIcon} className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium">Expenses coming soon.</h3>
            <p className="text-sm text-muted-foreground">
              This feature is not yet implemented. Check back soon!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
