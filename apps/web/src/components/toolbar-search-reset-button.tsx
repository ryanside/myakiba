import { FilterResetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ControlLabel, ControlTooltip } from "@/components/ui/control-tooltip";
import { TOOLBAR_LABEL_CLASS } from "@/components/ui/data-toolbar";

export function ToolbarSearchResetButton({
  onReset,
}: {
  readonly onReset: () => void;
}): React.JSX.Element {
  return (
    <ControlTooltip label="Reset Filters">
      <Button
        // Keeps focus in the search, because its blur would hide this button before the click lands.
        onPointerDown={(event) => event.preventDefault()}
        onClick={onReset}
        variant="ghost"
        className="text-muted-foreground"
      >
        <HugeiconsIcon icon={FilterResetIcon} data-icon="inline-start" />
        <ControlLabel className={TOOLBAR_LABEL_CLASS}>Reset Filters</ControlLabel>
      </Button>
    </ControlTooltip>
  );
}
