import { Button } from "@/components/ui/button";

/** Says the Collection is filtered to what the Add page just added, and undoes that. */
export function JustAddedChip({
  count,
  onShowAll,
}: {
  readonly count: number;
  readonly onShowAll: () => void;
}) {
  return (
    <p className="flex min-h-7 w-fit flex-wrap items-center gap-x-2 rounded-full bg-muted px-3 py-1 text-sm">
      {count === 1
        ? "Showing the item you just added"
        : `Showing the ${count} items you just added`}
      <Button variant="link" className="h-auto px-0" onClick={onShowAll}>
        Show all
      </Button>
    </p>
  );
}
