import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_SIZE,
  DEFAULT_LIMIT,
} from "@myakiba/contracts/shared/constants";

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
  const paginationDefaultKeys = new Set<string>();
  if (search.pageIndex === DEFAULT_PAGE_INDEX) paginationDefaultKeys.add("pageIndex");
  if (search.pageSize === DEFAULT_PAGE_SIZE) paginationDefaultKeys.add("pageSize");
  if (search.limit === (defaults?.limit ?? DEFAULT_LIMIT)) paginationDefaultKeys.add("limit");
  if (search.offset === 0) paginationDefaultKeys.add("offset");
  if (search.page === 1) paginationDefaultKeys.add("page");
  // Only remove default sort when both sort and order are at their defaults
  if (search.sort === "createdAt" && search.order === "desc") {
    paginationDefaultKeys.add("sort");
    paginationDefaultKeys.add("order");
  }

  const entries = Object.entries(search).filter(([key, value]) => {
    if (paginationDefaultKeys.has(key)) return false;
    if (value === undefined || value === "") return false;
    if (typeof value === "number" && Number.isNaN(value)) return false;
    return true;
  });

  return Object.fromEntries(entries) as Partial<T>;
};
