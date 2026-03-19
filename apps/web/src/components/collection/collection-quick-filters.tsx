import { useCollectionFilters } from "@/hooks/use-collection";
import type { Category } from "@myakiba/types";
import { Toggle } from "../ui/toggle";

type QuickFilterGroup = {
  readonly label: string;
  readonly categories: readonly Category[];
};

const QUICK_FILTER_GROUPS: readonly QuickFilterGroup[] = [
  {
    label: "Figures",
    categories: [
      "Accessories",
      "Action/Dolls",
      "Prepainted",
      "Garage Kits",
      "Model Kits",
      "Trading",
    ],
  },
  {
    label: "Goods",
    categories: [
      "Apparel",
      "Dishes",
      "Hanged up",
      "Linens",
      "Misc",
      "Plushes",
      "Stationeries",
      "On Walls",
    ],
  },
  {
    label: "Media",
    categories: ["Books", "Music", "Video", "Games"],
  },
];

export function CollectionQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useCollectionFilters();
  const activeCategories = new Set<Category>(filters.category ?? []);

  const isGroupActive = (group: QuickFilterGroup): boolean =>
    group.categories.every((cat) => activeCategories.has(cat));

  const toggleGroup = (group: QuickFilterGroup): void => {
    if (isGroupActive(group)) {
      const groupSet = new Set<Category>(group.categories);
      const remaining: Category[] = [...activeCategories].filter((cat) => !groupSet.has(cat));
      setFilters({
        category: remaining.length > 0 ? remaining : undefined,
        offset: 0,
      });
    } else {
      const merged = new Set(activeCategories);
      for (const cat of group.categories) {
        merged.add(cat);
      }
      setFilters({ category: [...merged], offset: 0 });
    }
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Quick category filters">
      {QUICK_FILTER_GROUPS.map((group) => {
        const active = isGroupActive(group);
        return (
          <Toggle key={group.label} pressed={active} onClick={() => toggleGroup(group)}>
            {group.label}
          </Toggle>
        );
      })}
    </div>
  );
}
