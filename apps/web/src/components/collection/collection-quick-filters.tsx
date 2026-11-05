import { useCollectionFilters } from "@/hooks/use-collection";
import { ITEM_CATEGORY_GROUPS } from "@myakiba/contracts/shared/constants";
import type { Category } from "@myakiba/contracts/shared/types";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

type QuickFilterGroup = {
  readonly label: string;
  readonly categories: readonly Category[];
};

const QUICK_FILTER_GROUPS: readonly QuickFilterGroup[] = Object.entries(ITEM_CATEGORY_GROUPS).map(
  ([label, categories]) => ({ label, categories }),
);

const GROUP_BY_LABEL = new Map(QUICK_FILTER_GROUPS.map((g) => [g.label, g] as const));

// "All" is pressed while no filter is on; pressing it clears the filters.
const ALL = "All";

export function CollectionQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useCollectionFilters();
  const activeCategories = new Set<Category>(filters.category);

  const activeGroupLabels = QUICK_FILTER_GROUPS.filter((g) =>
    g.categories.every((cat) => activeCategories.has(cat)),
  ).map((g) => g.label);

  const isAll = (filters.category?.length ?? 0) === 0;

  const handleValueChange = (values: string[]): void => {
    const labels = values.includes(ALL) && !isAll ? [] : values;
    const categories: Category[] = labels.flatMap((label) => {
      const group = GROUP_BY_LABEL.get(label);
      return group ? [...group.categories] : [];
    });

    setFilters({
      category: categories.length > 0 ? categories : undefined,
      offset: 0,
    });
  };

  return (
    <ToggleGroup
      value={isAll ? [ALL] : activeGroupLabels}
      onValueChange={handleValueChange}
      multiple
      variant="pill"
      size="sm"
      spacing={1.5}
      aria-label="Quick filters"
    >
      <ToggleGroupItem value={ALL}>{ALL}</ToggleGroupItem>
      {QUICK_FILTER_GROUPS.map((group) => (
        <ToggleGroupItem key={group.label} value={group.label}>
          {group.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
