import type { Category } from "@myakiba/types";

const CATEGORY_COLOR_MAP: Readonly<Record<Category, string>> = {
  Accessories: "var(--category-accessories)",
  "Action/Dolls": "var(--category-action-dolls)",
  Prepainted: "var(--category-prepainted)",
  "Garage Kits": "var(--category-garage-kits)",
  "Model Kits": "var(--category-model-kits)",
  Trading: "var(--category-trading)",
  Apparel: "var(--category-apparel)",
  Dishes: "var(--category-dishes)",
  "Hanged up": "var(--category-hanged-up)",
  Linens: "var(--category-linens)",
  Misc: "var(--category-misc)",
  Plushes: "var(--category-plushes)",
  Stationeries: "var(--category-stationeries)",
  "On Walls": "var(--category-on-walls)",
  Books: "var(--category-books)",
  Music: "var(--category-music)",
  Video: "var(--category-video)",
  Games: "var(--category-games)",
};

export function getCategoryColor(category: Category | null | undefined): string {
  if (!category) {
    return "var(--muted-foreground)";
  }

  return CATEGORY_COLOR_MAP[category] ?? "var(--muted-foreground)";
}
