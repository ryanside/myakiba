import { CATEGORY_COLORS } from "@myakiba/constants";
import type { Category } from "@myakiba/types";

/**
 * Returns the CSS color variable for a given category.
 */
export function getCategoryColor(category: Category | null | undefined): string {
  if (!category) return "var(--muted-foreground)";

  return CATEGORY_COLORS[category] || "var(--muted-foreground)";
}
