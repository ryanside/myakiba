import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/(app)/expenses")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `your expenses`,
      },
      {
        title: `Expenses — myakiba`,
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="flex-1 gap-y-4 p-4 md:p-8 pt-6">
      <div className="rounded-lg border border-dashed p-8">
        <div className="flex flex-col items-center justify-center gap-y-4 text-center">
          <Construction className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Expenses in Development</h3>
            <p className="text-sm text-muted-foreground">
              This feature is currently under construction. Check back soon!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
