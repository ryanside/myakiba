import type { SortDirection } from "@tanstack/react-table";

export function ariaSort(sorted: false | SortDirection): "ascending" | "descending" | undefined {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return undefined;
}
