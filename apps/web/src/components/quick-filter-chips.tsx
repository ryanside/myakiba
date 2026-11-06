import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// "All" is pressed while no filter is on; pressing it clears the filters.
const ALL = "All";

export function QuickFilterChips<T extends string>({
  options,
  selected,
  isAll = selected.length === 0,
  onChange,
}: {
  readonly options: readonly T[];
  readonly selected: readonly T[];
  /** Whether no filter is on. Pass it when a filter can be on without any chip selected. */
  readonly isAll?: boolean;
  readonly onChange: (selected: T[]) => void;
}): React.ReactElement {
  const isOption = (value: string): value is T => options.some((option) => option === value);
  const handleValueChange = (values: string[]): void => {
    onChange(values.includes(ALL) && !isAll ? [] : values.filter(isOption));
  };

  return (
    <ToggleGroup
      value={isAll ? [ALL] : [...selected]}
      onValueChange={handleValueChange}
      multiple
      variant="pill"
      size="sm"
      spacing={1.5}
      aria-label="Quick filters"
    >
      <ToggleGroupItem value={ALL}>{ALL}</ToggleGroupItem>
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option}>
          {option}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
