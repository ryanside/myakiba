import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_PAGE_INDEX, DEFAULT_PAGE_SIZE } from '../components/orders/sub-data-grid'
import { type SortingState } from '@tanstack/react-table'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  const newSearch = { ...search }
  Object.keys(newSearch).forEach(key => {
    const value = newSearch[key]
    if (
      value === undefined ||
      value === '' ||
      (typeof value === 'number' && isNaN(value))
    )
      delete newSearch[key]
  })

  // Remove pagination defaults
  if (search.pageIndex === DEFAULT_PAGE_INDEX) delete newSearch.pageIndex
  if (search.pageSize === DEFAULT_PAGE_SIZE) delete newSearch.pageSize
  if (search.limit === 10) delete newSearch.limit
  if (search.offset === 0) delete newSearch.offset
  if (search.sort === 'createdAt') delete newSearch.sort
  if (search.order === 'desc') delete newSearch.order

  return newSearch
}

