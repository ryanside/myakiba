import { app, getErrorMessage } from "@/lib/treaty-client";

export async function getItem(externalId: number) {
  const { data, error } = await app.api.item({ externalId }).get();
  if (error) {
    if (error.status === 404) return null;
    throw new Error(getErrorMessage(error, "Failed to get item"));
  }
  return data;
}

export async function getItemRelatedOrders(externalId: number) {
  const { data, error } = await app.api.item({ externalId }).orders.get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get item related orders"));
  }
  return data;
}

export async function getItemRelatedCollection(externalId: number) {
  const { data, error } = await app.api.item({ externalId }).collection.get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get item related collection"));
  }
  return data;
}

export async function getResyncStatus(externalId: number) {
  const { data, error } = await app.api.item({ externalId })["resync-status"].get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get resync status"));
  }
  return data;
}

export async function requestResync(externalId: number) {
  const { data, error } = await app.api.item({ externalId }).resync.post();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to request resync"));
  }
  return data;
}
