import { GridViewIcon, LeftToRightListDashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ListViewMode = "grid" | "list";

export function ListViewToggle({
  value,
  onValueChange,
}: {
  readonly value: ListViewMode;
  readonly onValueChange: (value: ListViewMode) => void;
}): React.JSX.Element {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(newValue) => {
        if (newValue.length > 0) {
          onValueChange(newValue[0] as ListViewMode);
        }
      }}
      variant="outline"
    >
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <HugeiconsIcon icon={GridViewIcon} strokeWidth={2} />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List view">
        <HugeiconsIcon icon={LeftToRightListDashIcon} strokeWidth={2} />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
