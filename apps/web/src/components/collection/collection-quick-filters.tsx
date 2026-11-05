import { useCollectionFilters } from "@/hooks/use-collection";
import { ITEM_CATEGORY_GROUPS } from "@myakiba/contracts/shared/constants";
import type { Category } from "@myakiba/contracts/shared/types";
import { QuickFilterChips } from "../quick-filter-chips";

type QuickFilterGroup = {
  readonly label: string;
  readonly categories: readonly Category[];
};

const QUICK_FILTER_GROUPS: readonly QuickFilterGroup[] = Object.entries(ITEM_CATEGORY_GROUPS).map(
  ([label, categories]) => ({ label, categories }),
);

const GROUP_LABELS = QUICK_FILTER_GROUPS.map((g) => g.label);

const GROUP_BY_LABEL = new Map(QUICK_FILTER_GROUPS.map((g) => [g.label, g] as const));

export function CollectionQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useCollectionFilters();
  const activeCategories = new Set<Category>(filters.category);

  const activeGroupLabels = QUICK_FILTER_GROUPS.filter((g) =>
    g.categories.every((cat) => activeCategories.has(cat)),
  ).map((g) => g.label);

  const handleChange = (labels: string[]): void => {
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
    <QuickFilterChips
      options={GROUP_LABELS}
      selected={activeGroupLabels}
      // A category picked in the filter dialog is a filter even when it fills no whole group.
      isAll={(filters.category?.length ?? 0) === 0}
      onChange={handleChange}
    />
  );
}
