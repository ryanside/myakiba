import type { Column, RowData } from "@tanstack/react-table";

/** What a column header tells assistive technology about its sort. */
export function getAriaSort<TData extends RowData>(
  column: Column<TData>,
): "ascending" | "descending" | "none" | undefined {
  const sorted = column.getIsSorted();

  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return column.getCanSort() ? "none" : undefined;
}
