import { call, rejectErr } from "@/data/api";
import { app } from "@/lib/treaty-client";
import type { ItemSyncInput } from "@myakiba/contracts/sync/schema";
import type {
  UserItem,
  SyncOrder,
  SyncOrderItems,
  SyncCollectionItem,
} from "@myakiba/contracts/sync/types";
import type {
  SyncSessionItemStatus,
  SyncSessionStatus,
  SyncType,
} from "@myakiba/contracts/shared/types";

export async function sendItems(userItems: UserItem[]) {
  return call(app.api.sync.csv.post(userItems), {
    fallback: "Failed to submit MyFigureCollection CSV",
    policy: "legacy",
  }).then(rejectErr);
}

export async function sendItemSync(input: ItemSyncInput) {
  return call(app.api.sync.item.post(input), {
    fallback: "Failed to submit item database items",
    policy: "legacy",
  }).then(rejectErr);
}

export async function sendOrder(order: SyncOrder) {
  return call(app.api.sync.order.post(order), {
    fallback: "Failed to submit order",
    policy: "legacy",
  }).then(rejectErr);
}

export async function sendOrderItems(orderItems: SyncOrderItems) {
  return call(
    app.api.sync["order-item"].post({
      orderId: orderItems.orderId,
      items: [...orderItems.items],
    }),
    { fallback: "Failed to submit order items", policy: "legacy" },
  ).then(rejectErr);
}

export async function sendCollection(collection: SyncCollectionItem[]) {
  return call(app.api.sync.collection.post(collection), {
    fallback: "Failed to submit collection items",
    policy: "legacy",
  }).then(rejectErr);
}

export type SyncResponse = Awaited<ReturnType<typeof sendItems>>;

export async function fetchSyncSessions(params: {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: SyncSessionStatus[];
  readonly syncType?: SyncType[];
}) {
  return call(
    app.api.sync.sessions.get({
      query: {
        page: params.page?.toString(),
        limit: params.limit?.toString(),
        status: params.status,
        syncType: params.syncType,
      },
    }),
    { fallback: "Failed to load import history", policy: "legacy" },
  ).then(rejectErr);
}

export async function fetchSyncSessionDetail(
  sessionId: string,
  params?: {
    readonly page?: number;
    readonly limit?: number;
    readonly status?: SyncSessionItemStatus[];
  },
) {
  return call(
    app.api.sync.sessions({ id: sessionId }).get({
      query: {
        page: params?.page?.toString(),
        limit: params?.limit?.toString(),
        status: params?.status,
      },
    }),
    { fallback: "Failed to load import details", policy: "legacy" },
  ).then(rejectErr);
}

export async function retrySyncSession(sessionId: string) {
  return call(app.api.sync.sessions({ id: sessionId }).retry.post(), {
    fallback: "Failed to retry failed item results",
    policy: "legacy",
  }).then(rejectErr);
}
