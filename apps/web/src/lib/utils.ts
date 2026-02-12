import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE, DEFAULT_LIMIT } from "@myakiba/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PaginationDefaults {
  readonly limit?: number;
}

export const cleanEmptyParams = <T extends Record<string, unknown>>(
  search: T,
  defaults?: PaginationDefaults,
) => {
  const newSearch = { ...search };
  Object.keys(newSearch).forEach((key) => {
    const value = newSearch[key];
    if (value === undefined || value === "" || (typeof value === "number" && isNaN(value)))
      delete newSearch[key];
  });

  // Remove pagination defaults
  if (search.pageIndex === DEFAULT_PAGE_INDEX) delete newSearch.pageIndex;
  if (search.pageSize === DEFAULT_PAGE_SIZE) delete newSearch.pageSize;
  if (search.limit === (defaults?.limit ?? DEFAULT_LIMIT)) delete newSearch.limit;
  if (search.offset === 0) delete newSearch.offset;
  if (search.page === 1) delete newSearch.page;
  // Only remove default sort when both sort and order are at their defaults
  if (search.sort === "createdAt" && search.order === "desc") {
    delete newSearch.sort;
    delete newSearch.order;
  }

  return newSearch;
};
