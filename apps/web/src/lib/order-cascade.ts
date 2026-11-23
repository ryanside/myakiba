import { ORDER_CASCADE_OPTIONS } from "@myakiba/contracts/orders/constants";
import type { CascadeOptions } from "@myakiba/contracts/orders/schema";

export function cascadeToItems(changedFields: Iterable<string>): CascadeOptions {
  const changed = new Set(changedFields);
  return ORDER_CASCADE_OPTIONS.filter((field) => changed.has(field));
}
