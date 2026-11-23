import { ORDER_CASCADE_OPTIONS } from "@myakiba/contracts/orders/constants";
import type { CascadeOptions } from "@myakiba/contracts/orders/schema";

/**
 * What an Order edit that changed these fields sends as Cascade to Items. The server copies each
 * one only to the Order Items that still held the Order's old value.
 */
export function cascadeToItems(changedFields: Iterable<string>): CascadeOptions {
  const changed = new Set(changedFields);
  return ORDER_CASCADE_OPTIONS.filter((field) => changed.has(field));
}
