import { client } from "@/lib/hono-client";
import type { userItem, SyncOrder, SyncCollectionItem } from "@/lib/sync/types";

export async function sendItems(userItems: userItem[]) {
  const response = await client.api.sync.csv.$post({
    json: userItems,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function sendOrder(order: SyncOrder) {
  const response = await client.api.sync.order.$post({
    json: order,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function sendCollection(collection: SyncCollectionItem[]) {
  const response = await client.api.sync.collection.$post({
    json: collection,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json();
}
