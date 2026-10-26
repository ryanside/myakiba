import type {
  NormalizedInternalCsvItem,
  QueuedCollectionItem,
  UpdatedSyncOrder,
  SyncJobStatus,
} from "@myakiba/contracts/sync/schema";
import { parseMoneyInputToMinorUnits } from "@myakiba/utils/currency";
import type { ExistingItemWithLatestRelease } from "./model";

export function csvPriceWarnings(
  items: readonly Pick<NormalizedInternalCsvItem, "itemExternalId" | "price">[],
): Pick<SyncJobStatus, "warnings"> {
  const warnings = items.flatMap((item) =>
    parseMoneyInputToMinorUnits(item.price).isErr()
      ? [{ mfcItemId: item.itemExternalId, input: item.price }]
      : [],
  );
  return warnings.length > 0 ? { warnings } : {};
}

export function prepareCsvItems(
  items: readonly NormalizedInternalCsvItem[],
  existingItems: readonly ExistingItemWithLatestRelease[],
  userId: string,
) {
  const existingItemsByExternalId = new Map(existingItems.map((item) => [item.externalId, item]));
  const collectionItems: QueuedCollectionItem[] = [];
  const orderItems: UpdatedSyncOrder[] = [];
  const csvItemsToFetch: NormalizedInternalCsvItem[] = [];
  const existingItemExternalIds: number[] = [];

  for (const item of items) {
    const existingItem = existingItemsByExternalId.get(item.itemExternalId);
    if (!existingItem) {
      csvItemsToFetch.push(item);
      continue;
    }

    existingItemExternalIds.push(item.itemExternalId);
    collectionItems.push({
      id: item.collectionId,
      userId,
      itemId: existingItem.id,
      releaseId: existingItem.releaseId,
      orderId: item.orderId,
      status: item.status,
      count: item.count,
      score: item.score.trim() === "" ? "0.0" : item.score,
      price: parseMoneyInputToMinorUnits(item.price).unwrapOr(0),
      shop: item.shop,
      orderDate: item.orderDate,
      paymentDate: item.payment_date,
      shippingDate: item.shipping_date,
      collectionDate: item.collecting_date,
      shippingMethod: item.shipping_method,
      notes: item.note,
      tags: [],
      condition: "New",
    });

    if (item.status === "Ordered" && item.orderId !== null) {
      orderItems.push({
        id: item.orderId,
        userId,
        title: existingItem.title || `Order ${item.orderId}`,
        shop: item.shop,
        orderDate: item.orderDate,
        releaseDate: existingItem.releaseDate,
        paymentDate: item.payment_date,
        shippingDate: item.shipping_date,
        collectionDate: item.collecting_date,
        shippingMethod: item.shipping_method,
        status: "Ordered",
        shippingFee: 0,
        taxes: 0,
        duties: 0,
        tariffs: 0,
        miscFees: 0,
        notes: "",
      });
    }
  }

  return {
    collectionItems,
    orderItems,
    csvItemsToFetch,
    existingItemExternalIds,
    ...csvPriceWarnings(items),
  };
}
