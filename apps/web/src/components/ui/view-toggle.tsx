import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Menu01Icon,
  GridViewIcon,
  LeftToRightListDashIcon,
  Image01Icon,
} from "@hugeicons/core-free-icons";

type ViewMode = "compact" | "table" | "grid" | "gallery";

interface ViewToggleProps {
  readonly value: ViewMode;
  readonly onValueChange: (value: ViewMode) => void;
}

export function ViewToggle({ value, onValueChange }: ViewToggleProps): React.JSX.Element {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(newValue) => {
        if (newValue.length > 0) {
          onValueChange(newValue[0] as ViewMode);
        }
      }}
      variant="outline"
    >
      <ToggleGroupItem value="compact" aria-label="Compact table view">
        <HugeiconsIcon icon={LeftToRightListDashIcon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label="Table view">
        <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Card grid view">
        <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="gallery" aria-label="Gallery view">
        <HugeiconsIcon icon={Image01Icon} strokeWidth={2} />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export type { ViewMode };
