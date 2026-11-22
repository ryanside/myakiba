import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { MergedOrder } from "@myakiba/contracts/orders/schema";

const shared = <T>(values: readonly T[], otherwise: T): T =>
  new Set(values).size === 1 ? (values[0] ?? otherwise) : otherwise;

const dates = (values: readonly (string | null)[]) =>
  values.filter((value) => value !== null).toSorted();

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export function mergedOrder(sources: readonly MergedOrder[]): MergedOrder {
  const stage = Math.min(...sources.map((source) => ORDER_STATUSES.indexOf(source.status)));
  return {
    shop: shared(
      sources.map((source) => source.shop),
      "",
    ),
    status: ORDER_STATUSES[stage] ?? "Ordered",
    paid: sources.every((source) => source.paid),
    orderDate: dates(sources.map((source) => source.orderDate)).at(0) ?? null,
    releaseDate: dates(sources.map((source) => source.releaseDate)).at(-1) ?? null,
    paymentDate: dates(sources.map((source) => source.paymentDate)).at(-1) ?? null,
    shippingDate: dates(sources.map((source) => source.shippingDate)).at(-1) ?? null,
    collectionDate: dates(sources.map((source) => source.collectionDate)).at(-1) ?? null,
    shippingMethod: shared(
      sources.map((source) => source.shippingMethod),
      "n/a",
    ),
    shippingFee: sum(sources.map((source) => source.shippingFee)),
    taxes: sum(sources.map((source) => source.taxes)),
    duties: sum(sources.map((source) => source.duties)),
    tariffs: sum(sources.map((source) => source.tariffs)),
    miscFees: sum(sources.map((source) => source.miscFees)),
    notes: [...new Set(sources.map((source) => source.notes).filter(Boolean))].join("\n\n"),
  };
}
