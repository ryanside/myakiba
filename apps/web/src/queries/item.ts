import { requireData } from "@/lib/api-response";
import { app, getErrorMessage } from "@/lib/treaty-client";
import type { ItemReleasesResponse } from "@myakiba/contracts/item/schema";

export async function getItem(externalId: number) {
  const response = await app.api.item({ id: externalId }).get();
  if (response.error?.status === 404) return null;
  return requireData(response, "Failed to get item");
}

export async function getItemReleases(itemId: string): Promise<ItemReleasesResponse> {
  return requireData(app.api.item({ id: itemId }).releases.get(), "Failed to get item releases");
}

export async function getItemRelatedOrders(externalId: number) {
  return requireData(
    app.api.item({ id: externalId }).orders.get(),
    "Failed to get item related orders",
  );
}

export async function getItemRelatedCollection(externalId: number) {
  return requireData(
    app.api.item({ id: externalId }).collection.get(),
    "Failed to get item related collection",
  );
}

export async function getResyncStatus(externalId: number) {
  const { data, error } = await app.api.item({ id: externalId })["resync-status"].get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to check item refresh status"));
  }
  return data;
}

export async function requestResync(externalId: number) {
  const { data, error } = await app.api.item({ id: externalId }).resync.post();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to request item refresh"));
  }
  return data;
}
