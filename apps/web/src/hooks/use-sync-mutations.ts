import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { SyncCollectionItem, SyncOrder, SyncOrderItems } from "@myakiba/contracts/sync/types";
import { SYNC_OPTION_META, transformCSVData } from "@/lib/sync";
import { syncSends, useSyncSubmit } from "@/data/resources/sync";
import type { SyncResponse } from "@/queries/sync";
import type { SyncType } from "@myakiba/contracts/shared/types";
import { toast } from "@/components/ui/toast";
import type { ItemSyncInput } from "@myakiba/contracts/sync/schema";
import { requireExtension } from "@/lib/extension-gate";
import { importSyncItems } from "@/data/extension-run";
import { toastRunOutcome } from "@/components/extension/run-outcome-toast";
import type { Saving } from "@/data/client";

export type SyncSubmit = "sent" | "not_sent";

export type UseSyncMutationsReturn = {
  readonly handleSyncItemsSubmit: (values: ItemSyncInput) => Promise<SyncSubmit>;
  readonly handleSyncCsvSubmit: (value: File | undefined) => Promise<SyncSubmit>;
  readonly handleSyncOrderSubmit: (values: SyncOrder) => Promise<SyncSubmit>;
  readonly handleSyncOrderItemSubmit: (values: SyncOrderItems) => Promise<SyncSubmit>;
  readonly handleSyncCollectionSubmit: (values: SyncCollectionItem[]) => Promise<SyncSubmit>;
  readonly isSyncing: boolean;
};

async function sendWithExtension<Input>(
  send: (input: Input) => Saving<SyncResponse>,
  input: Input,
): Promise<SyncSubmit> {
  if (!(await requireExtension())) return "not_sent";
  const sent = await send(input);
  if (sent.isErr()) return "not_sent";
  return "sent";
}

export function useSyncMutations(onComplete?: () => void): UseSyncMutationsReturn {
  const navigate = useNavigate();

  const handleSuccess = useCallback(
    (data: SyncResponse, syncType: SyncType): void => {
      onComplete?.();
      if (data.jobId !== null && data.missingMfcItemIds.length > 0) {
        toastRunOutcome(
          importSyncItems({
            sessionId: data.syncSessionId,
            jobId: data.jobId,
            mfcItemIds: data.missingMfcItemIds,
          }),
        );
      }

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
        description = `Added ${itemCount} item${itemCount === 1 ? "" : "s"}`;
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

  const itemSync = useSyncSubmit(syncSends.item, {
    onSaved: (data) => handleSuccess(data, "item"),
    onFailed: (error) => {
      const toastId = toast.add({
        type: "error",
        title: SYNC_OPTION_META["item"].failureTitle,
        description: error.message.trim() || "Failed to submit item database items.",
        actionProps: {
          children: "View import history",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/sync" });
          },
        },
      });
    },
  });

  const csvSync = useSyncSubmit(syncSends.csv, {
    onSaved: (data) => handleSuccess(data, "csv"),
    onFailed: (error) => {
      const toastId = toast.add({
        type: "error",
        title: SYNC_OPTION_META["csv"].failureTitle,
        description: error.message.trim() || "Failed to submit MyFigureCollection CSV.",
        actionProps: {
          children: "View import history",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/sync" });
          },
        },
      });
    },
  });

  const orderSync = useSyncSubmit(syncSends.order, {
    onSaved: (data) => handleSuccess(data, "order"),
    onFailed: (error) => {
      const toastId = toast.add({
        type: "error",
        title: SYNC_OPTION_META["order"].failureTitle,
        description: error.message.trim() || "Failed to submit order.",
        actionProps: {
          children: "View import history",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/sync" });
          },
        },
      });
    },
  });

  const orderItemSync = useSyncSubmit(syncSends.orderItem, {
    onSaved: (data) => handleSuccess(data, "order-item"),
    onFailed: (error) => {
      const toastId = toast.add({
        type: "error",
        title: SYNC_OPTION_META["order-item"].failureTitle,
        description: error.message.trim() || "Failed to submit order items.",
        actionProps: {
          children: "View import history",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/sync" });
          },
        },
      });
    },
  });

  const collectionSync = useSyncSubmit(syncSends.collection, {
    onSaved: (data) => handleSuccess(data, "collection"),
    onFailed: (error) => {
      const toastId = toast.add({
        type: "error",
        title: SYNC_OPTION_META["collection"].failureTitle,
        description: error.message.trim() || "Failed to submit collection items.",
        actionProps: {
          children: "View import history",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/sync" });
          },
        },
      });
    },
  });

  const handleSyncItemsSubmit = useCallback(
    (values: ItemSyncInput) => sendWithExtension(itemSync.send, values),
    [itemSync],
  );

  const handleSyncCsvSubmit = useCallback(
    async (value: File | undefined): Promise<SyncSubmit> => {
      const userItems = await transformCSVData({ file: value });
      if (userItems.isErr()) {
        const toastId = toast.add({
          type: "error",
          title: SYNC_OPTION_META.csv.failureTitle,
          description: userItems.error.message,
          actionProps: {
            children: "View import history",
            onClick() {
              toast.close(toastId);
              void navigate({ to: "/sync" });
            },
          },
        });
        return "not_sent";
      }

      return sendWithExtension(csvSync.send, userItems.value);
    },
    [csvSync, navigate],
  );

  const handleSyncOrderSubmit = useCallback(
    (values: SyncOrder) => sendWithExtension(orderSync.send, values),
    [orderSync],
  );

  const handleSyncCollectionSubmit = useCallback(
    (values: SyncCollectionItem[]) => sendWithExtension(collectionSync.send, values),
    [collectionSync],
  );

  const handleSyncOrderItemSubmit = useCallback(
    (values: SyncOrderItems) => sendWithExtension(orderItemSync.send, values),
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
