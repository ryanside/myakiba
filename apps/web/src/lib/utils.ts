import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from "@myakiba/constants";

export {
  tryCatch,
  type Result,
  formatCurrency,
  getCurrencyLocale,
  formatDate,
  parseLocalDate,
  getCategoryColor,
} from "@myakiba/utils";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const cleanEmptyParams = <T extends Record<string, unknown>>(
  search: T
) => {
  const newSearch = { ...search };
  Object.keys(newSearch).forEach((key) => {
    const value = newSearch[key];
    if (
      value === undefined ||
      value === "" ||
      (typeof value === "number" && isNaN(value))
    )
      delete newSearch[key];
  });

  // Remove pagination defaults
  if (search.pageIndex === DEFAULT_PAGE_INDEX) delete newSearch.pageIndex;
  if (search.pageSize === DEFAULT_PAGE_SIZE) delete newSearch.pageSize;
  if (search.limit === 10) delete newSearch.limit;
  if (search.offset === 0) delete newSearch.offset;
  if (search.sort === "createdAt") delete newSearch.sort;
  if (search.order === "desc") delete newSearch.order;

  return newSearch;
};
