import { createFileRoute, notFound } from "@tanstack/react-router";
import { ANALYTICS_SECTIONS } from "@myakiba/contracts/shared/constants";
import { z } from "zod";
import { CodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export const Route = createFileRoute("/(app)/analytics_/$sectionName")({
  beforeLoad: ({ params }) => {
    const sectionName = z.enum(ANALYTICS_SECTIONS).parse(params.sectionName);
    if (!ANALYTICS_SECTIONS.includes(sectionName)) {
      throw notFound();
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { sectionName } = Route.useParams();

  return (
    <div className="flex-1 gap-y-4 p-4 md:p-8 pt-6">
      <div className="rounded-lg border border-dashed p-8">
        <div className="flex flex-col items-center justify-center gap-y-4 text-center">
          <HugeiconsIcon icon={CodeIcon} className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium">/analytics/{sectionName} coming soon.</h3>
            <p className="text-sm text-muted-foreground">
              a dedicated page for analyzing {sectionName} of your collection
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
