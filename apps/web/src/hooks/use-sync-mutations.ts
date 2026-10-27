import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { SyncCollectionItem, SyncOrder, SyncOrderItems } from "@myakiba/contracts/sync/types";
import { SYNC_OPTION_META, transformCSVData, unreadPricesText } from "@/lib/sync";
import { syncSends, useSyncSubmit } from "@/data/resources/sync";
import type { SyncResponse } from "@/queries/sync";
import type { SyncType } from "@myakiba/contracts/shared/types";
import { toast } from "@/components/ui/toast";
import type { FailureToast } from "@/data/client";
import type { ItemSyncInput } from "@myakiba/contracts/sync/schema";
import type { Result } from "better-result";

export type SyncSubmit = "sent" | "not_sent";

export type UseSyncMutationsReturn = {
  readonly handleSyncItemsSubmit: (values: ItemSyncInput) => Promise<SyncSubmit>;
  readonly handleSyncCsvSubmit: (value: File | undefined) => Promise<SyncSubmit>;
  readonly handleSyncOrderSubmit: (values: SyncOrder) => Promise<SyncSubmit>;
  readonly handleSyncOrderItemSubmit: (values: SyncOrderItems) => Promise<SyncSubmit>;
  readonly handleSyncCollectionSubmit: (values: SyncCollectionItem[]) => Promise<SyncSubmit>;
  readonly isSyncing: boolean;
};

async function submitSync<Input>(
  send: (input: Input) => Promise<Result<SyncResponse, unknown>>,
  input: Input,
): Promise<SyncSubmit> {
  const sent = await send(input);
  return sent.isOk() ? "sent" : "not_sent";
}

export function useSyncMutations(onComplete?: () => void): UseSyncMutationsReturn {
  const navigate = useNavigate();

  const handleSuccess = useCallback(
    (data: SyncResponse, syncType: SyncType): void => {
      onComplete?.();

      const itemCount = data.existingItemsToInsert + data.newItems;
      const meta = SYNC_OPTION_META[syncType];
      let title: string = meta.pendingTitle;
      let description = [
        `${data.newItems} item${data.newItems === 1 ? "" : "s"} to fetch from MyFigureCollection`,
        data.existingItemsToInsert > 0
          ? `${data.existingItemsToInsert} already in the item database`
          : null,
      ]
        .filter((part) => part !== null)
        .join(", ");

      if (data.isFinished) {
        title = meta.completedTitle;
        const added = `Added ${itemCount} item${itemCount === 1 ? "" : "s"}`;
        const unread = unreadPricesText(data.warnings);
        description = unread === null ? added : `${added}. ${unread}`;
      }

      if (syncType === "item" && data.isFinished) {
        title = "No new items to add";
        description = data.status;
      }

      const toastId = toast.add({
        type: data.isFinished ? "success" : "info",
        title,
        description,
        actionProps: {
          children: data.isFinished ? "View details" : "View progress",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/sync/$id", params: { id: data.syncSessionId } });
          },
        },
      });
    },
    [navigate, onComplete],
  );

  const toastFailure = useCallback(
    (title: string, description: string): void => {
      const toastId = toast.add({
        type: "error",
        title,
        description,
        actionProps: {
          children: "View import history",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/sync" });
          },
        },
      });
    },
    [navigate],
  );
  const failedWith =
    (fallback: string) =>
    ({ title, description = "" }: FailureToast): void =>
      toastFailure(title, description.trim() || fallback);

  const itemSync = useSyncSubmit(syncSends.item, {
    onSaved: (data) => handleSuccess(data, "item"),
    onFailed: failedWith("Failed to submit item database items."),
  });

  const csvSync = useSyncSubmit(syncSends.csv, {
    onSaved: (data) => handleSuccess(data, "csv"),
    onFailed: failedWith("Failed to submit MyFigureCollection CSV."),
  });

  const orderSync = useSyncSubmit(syncSends.order, {
    onSaved: (data) => handleSuccess(data, "order"),
    onFailed: failedWith("Failed to submit order."),
  });

  const orderItemSync = useSyncSubmit(syncSends.orderItem, {
    onSaved: (data) => handleSuccess(data, "order-item"),
    onFailed: failedWith("Failed to submit order items."),
  });

  const collectionSync = useSyncSubmit(syncSends.collection, {
    onSaved: (data) => handleSuccess(data, "collection"),
    onFailed: failedWith("Failed to submit collection items."),
  });

  const handleSyncItemsSubmit = useCallback(
    (values: ItemSyncInput) => submitSync(itemSync.send, values),
    [itemSync],
  );

  const handleSyncCsvSubmit = useCallback(
    async (value: File | undefined): Promise<SyncSubmit> => {
      const userItems = await transformCSVData({ file: value });
      if (userItems.isErr()) {
        toastFailure(SYNC_OPTION_META.csv.failureTitle, userItems.error.message);
        return "not_sent";
      }

      return submitSync(csvSync.send, userItems.value);
    },
    [csvSync, toastFailure],
  );

  const handleSyncOrderSubmit = useCallback(
    (values: SyncOrder) => submitSync(orderSync.send, values),
    [orderSync],
  );

  const handleSyncCollectionSubmit = useCallback(
    (values: SyncCollectionItem[]) => submitSync(collectionSync.send, values),
    [collectionSync],
  );

  const handleSyncOrderItemSubmit = useCallback(
    (values: SyncOrderItems) => submitSync(orderItemSync.send, values),
    [orderItemSync],
  );

  const isSyncing =
    itemSync.isPending ||
    csvSync.isPending ||
    orderSync.isPending ||
    orderItemSync.isPending ||
    collectionSync.isPending;

  return {
    handleSyncItemsSubmit,
    handleSyncCsvSubmit,
    handleSyncOrderSubmit,
    handleSyncOrderItemSubmit,
    handleSyncCollectionSubmit,
    isSyncing,
  };
}
