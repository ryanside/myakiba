import { useCollectionFilters } from "@/hooks/use-collection";
import { ITEM_CATEGORY_GROUPS } from "@myakiba/contracts/shared/constants";
import type { Category } from "@myakiba/contracts/shared/types";
import { QuickFilterChips } from "../quick-filter-chips";

type GroupLabel = keyof typeof ITEM_CATEGORY_GROUPS;

const GROUP_LABELS = Object.keys(ITEM_CATEGORY_GROUPS) as GroupLabel[];

export function CollectionQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useCollectionFilters();
  const activeCategories = new Set<Category>(filters.category);

  const activeGroupLabels = GROUP_LABELS.filter((label) =>
    ITEM_CATEGORY_GROUPS[label].every((cat) => activeCategories.has(cat)),
  );

  const handleChange = (labels: GroupLabel[]): void => {
    const categories: Category[] = labels.flatMap((label) => ITEM_CATEGORY_GROUPS[label]);

    setFilters({
      category: categories.length > 0 ? categories : undefined,
      offset: 0,
    });
  };

  return (
    <QuickFilterChips
      options={GROUP_LABELS}
      selected={activeGroupLabels}
      // A category picked in the filter dialog is a filter even when it fills no whole group.
      isAll={(filters.category?.length ?? 0) === 0}
      onChange={handleChange}
    />
  );
}
