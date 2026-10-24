import { Result } from "better-result";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { app } from "@/lib/treaty-client";
import type { ItemReleasesResponse } from "@myakiba/contracts/item/schema";
import type { ItemRefresh } from "@myakiba/contracts/mfc-items/schema";

/** The item's page, or null when it has no row: the screen shows its not-found view for that. */
export function getItem(externalId: number) {
  return call(app.api.item({ id: externalId }).get(), { fallback: "Failed to get item" }).then(
    Result.tryRecover((failure) =>
      ApiNotFound.is(failure) ? Result.ok(null) : Result.err(failure),
    ),
  );
}

export function getItemReleases(itemId: string): Promise<Result<ItemReleasesResponse, ApiFailure>> {
  return call(app.api.item({ id: itemId }).releases.get(), {
    fallback: "Failed to get item releases",
  });
}

export function getItemRelatedOrders(externalId: number) {
  return call(app.api.item({ id: externalId }).orders.get(), {
    fallback: "Failed to get item related orders",
  });
}

export function getItemRelatedCollection(externalId: number) {
  return call(app.api.item({ id: externalId }).collection.get(), {
    fallback: "Failed to get item related collection",
  });
}

export function getResyncStatus(externalId: number) {
  return call(app.api.item({ id: externalId })["resync-status"].get(), {
    fallback: "Failed to check item refresh status",
    policy: "legacy",
  });
}

/**
 * Still rejects with the failure, because data/extension-run.ts awaits a rejection. It returns the
 * Result once the extension run's slice moves to Result.
 */
export async function requestResync(externalId: number, upload: ItemRefresh) {
  const sent = await call(app.api.item({ id: externalId }).resync.post(upload), {
    fallback: "Failed to request item refresh",
    policy: "legacy",
  });
  if (sent.isErr()) throw sent.error;
  return sent.value;
}
