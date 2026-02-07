import { app, getErrorMessage } from "@/lib/treaty-client";
import type { UserItem, SyncOrder, SyncCollectionItem } from "@/lib/sync/types";

export async function sendItems(userItems: UserItem[]) {
  const { data, error } = await app.api.sync.csv.post(userItems);
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to send items"));
  }
  return data;
}

export async function sendOrder(order: SyncOrder) {
  const { data, error } = await app.api.sync.order.post(order);
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to send order"));
  }
  return data;
}

export async function sendCollection(collection: SyncCollectionItem[]) {
  const { data, error } = await app.api.sync.collection.post(collection);
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to send collection"));
  }
  return data;
}
