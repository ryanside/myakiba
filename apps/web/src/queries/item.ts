import { call, rejectErr } from "@/data/api";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { app } from "@/lib/treaty-client";
import type { ItemReleasesResponse } from "@myakiba/contracts/item/schema";
import type { ItemRefresh } from "@myakiba/contracts/mfc-items/schema";

export async function getItem(externalId: number) {
  const found = await call(app.api.item({ id: externalId }).get(), {
    fallback: "Failed to get item",
  });
  if (found.isErr() && ApiNotFound.is(found.error)) return null;
  return rejectErr(found);
}

export async function getItemReleases(itemId: string): Promise<ItemReleasesResponse> {
  return call(app.api.item({ id: itemId }).releases.get(), {
    fallback: "Failed to get item releases",
  }).then(rejectErr);
}

export async function getItemRelatedOrders(externalId: number) {
  return call(app.api.item({ id: externalId }).orders.get(), {
    fallback: "Failed to get item related orders",
  }).then(rejectErr);
}

export async function getItemRelatedCollection(externalId: number) {
  return call(app.api.item({ id: externalId }).collection.get(), {
    fallback: "Failed to get item related collection",
  }).then(rejectErr);
}

export async function getResyncStatus(externalId: number) {
  return call(app.api.item({ id: externalId })["resync-status"].get(), {
    fallback: "Failed to check item refresh status",
    policy: "legacy",
  }).then(rejectErr);
}

export async function requestResync(externalId: number, upload: ItemRefresh) {
  return call(app.api.item({ id: externalId }).resync.post(upload), {
    fallback: "Failed to request item refresh",
    policy: "legacy",
  }).then(rejectErr);
}
