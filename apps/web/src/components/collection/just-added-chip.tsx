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
    <p className="flex w-fit flex-wrap items-center gap-x-1.5 rounded-lg bg-muted px-2.5 py-1 text-sm">
      {count === 1
        ? "Showing the item you just added"
        : `Showing the ${count} items you just added`}
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <Button variant="link" size="xs" className="h-auto px-0 text-sm" onClick={onShowAll}>
        Show all
      </Button>
    </p>
  );
}
