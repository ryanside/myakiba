import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GridViewIcon,
  Image01Icon,
  LeftToRightListDashIcon,
  Menu01Icon,
} from "@hugeicons/core-free-icons";

export type DataViewMode = "compact" | "table" | "grid" | "gallery";
export type GridListViewMode = "grid" | "list";
type ViewMode = DataViewMode | GridListViewMode;

const VIEW_OPTIONS = {
  compact: { icon: LeftToRightListDashIcon, label: "Compact table view" },
  table: { icon: Menu01Icon, label: "Table view" },
  grid: { icon: GridViewIcon, label: "Grid view" },
  gallery: { icon: Image01Icon, label: "Gallery view" },
  list: { icon: LeftToRightListDashIcon, label: "List view" },
} as const;

interface ViewToggleProps<TModes extends readonly ViewMode[]> {
  readonly id?: string;
  readonly modes: TModes;
  readonly value: TModes[number];
  readonly onValueChange: (value: TModes[number]) => void;
}

export function ViewToggle<const TModes extends readonly ViewMode[]>({
  id,
  modes,
  value,
  onValueChange,
}: ViewToggleProps<TModes>): React.JSX.Element {
  return (
    <ToggleGroup
      id={id}
      value={[value]}
      onValueChange={(newValue) => {
        if (newValue.length > 0) {
          onValueChange(newValue[0] as TModes[number]);
        }
      }}
      variant="outline"
    >
      {modes.map((mode) => {
        const option = VIEW_OPTIONS[mode];
        return (
          <ToggleGroupItem key={mode} value={mode} aria-label={option.label}>
            <HugeiconsIcon icon={option.icon} strokeWidth={2} />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
