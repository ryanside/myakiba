import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_SIZE,
} from "../components/orders/orders-data-grid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Success<T> = {
  data: T;
  error: null;
};

type Failure<E> = {
  data: null;
  error: E;
};

export type Result<T, E = Error> = Success<T> | Failure<E>;

// Main wrapper function
export async function tryCatch<T, E = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}

export function formatCurrency(
  value: string | number,
  currency: string = "USD"
) {
  const amount = parseFloat(String(value || 0));

  switch (currency) {
    case "JPY":
      return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "EUR":
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "CNY":
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: currency,
      }).format(amount);
    case "USD":
    default:
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(amount);
  }
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

export function formatDate(dateString: string | null): string {
  if (!dateString) return "n/a";
  try {
    // Parse date as local date to avoid timezone issues
    // When "2026-04-01" is parsed as new Date(), it's treated as UTC midnight
    // which gets converted to the previous day in timezones behind UTC
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString();
  } catch {
    return "Invalid Date";
  }
}
