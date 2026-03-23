import { useCollectionFilters } from "@/hooks/use-collection";
import type { Category } from "@myakiba/contracts/shared/types";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

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

const GROUP_BY_LABEL = new Map(QUICK_FILTER_GROUPS.map((g) => [g.label, g] as const));

export function CollectionQuickFilters(): React.ReactElement {
  const { filters, setFilters } = useCollectionFilters();
  const activeCategories = new Set<Category>(filters.category ?? []);

  const activeGroupLabels = QUICK_FILTER_GROUPS.filter((g) =>
    g.categories.every((cat) => activeCategories.has(cat)),
  ).map((g) => g.label);

  const handleValueChange = (labels: string[]): void => {
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
      value={activeGroupLabels}
      onValueChange={handleValueChange}
      multiple
      variant="outline"
      size="sm"
    >
      {QUICK_FILTER_GROUPS.map((group) => (
        <ToggleGroupItem key={group.label} value={group.label}>
          {group.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
