import { app, getErrorMessage } from "@/lib/treaty-client";
import type {
  UserItem,
  SyncOrder,
  SyncCollectionItem,
  SyncSessionStatus,
  SyncType,
} from "@myakiba/types";

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

export async function fetchSyncSessions(params: {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: SyncSessionStatus;
  readonly syncType?: SyncType;
}) {
  const { data, error } = await app.api.sync.sessions.get({
    query: {
      page: params.page?.toString(),
      limit: params.limit?.toString(),
      status: params.status,
      syncType: params.syncType,
    },
  });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to fetch sync sessions"));
  }
  return data;
}

export async function fetchSyncSessionDetail(
  sessionId: string,
  params?: { readonly page?: number; readonly limit?: number },
) {
  const { data, error } = await app.api.sync.sessions({ id: sessionId }).get({
    query: {
      page: params?.page?.toString(),
      limit: params?.limit?.toString(),
    },
  });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to fetch sync session detail"));
  }
  return data;
}

export async function retrySyncFailedItems(syncSessionId: string) {
  const { data, error } = await app.api.sync.retry.post({
    syncSessionId,
  });
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to retry failed items"));
  }
  return data;
}
