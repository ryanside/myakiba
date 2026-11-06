import { FilterResetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

export function ResetFiltersButton({
  onReset,
}: {
  readonly onReset: () => Promise<void>;
}): React.JSX.Element {
  return (
    <Button
      // Keeps focus in the search, because its blur would hide this button before the click lands.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onReset}
      variant="ghost"
      className="text-muted-foreground"
    >
      <HugeiconsIcon icon={FilterResetIcon} data-icon="inline-start" />
      <span className="max-md:sr-only">Reset Filters</span>
    </Button>
  );
}
