import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { tryCatch } from "@myakiba/utils/result";
import type {
  SyncCollectionItem,
  SyncOrder,
  SyncOrderItems,
  UserItem,
} from "@myakiba/contracts/sync/types";
import { SYNC_OPTION_META, transformCSVData } from "@/lib/sync";
import { invalidateSyncResultQueries } from "@/lib/mutation-query-invalidation";
import { sendCollection, sendItemSync, sendItems, sendOrder, sendOrderItems } from "@/queries/sync";
import type { SyncResponse } from "@/queries/sync";
import type { SyncType } from "@myakiba/contracts/shared/types";
import { toast } from "@/components/ui/toast";
import type { ItemSyncInput } from "@myakiba/contracts/sync/schema";

export type UseSyncMutationsReturn = {
  readonly handleSyncItemsSubmit: (values: ItemSyncInput) => Promise<SyncResponse>;
  readonly handleSyncCsvSubmit: (value: File | undefined) => Promise<void>;
  readonly handleSyncOrderSubmit: (values: SyncOrder) => Promise<void>;
  readonly handleSyncOrderItemSubmit: (values: SyncOrderItems) => Promise<void>;
  readonly handleSyncCollectionSubmit: (values: SyncCollectionItem[]) => Promise<void>;
  readonly isSyncing: boolean;
};

export function useSyncMutations(
  queryClient: QueryClient,
  onComplete?: () => void,
): UseSyncMutationsReturn {
  const navigate = useNavigate();

  const handleSuccess = useCallback(
    (data: SyncResponse, syncType: SyncType): void => {
      onComplete?.();

      const itemCount = data.existingItemsToInsert + data.newItems;
      const meta = SYNC_OPTION_META[syncType];
      let title: string = meta.pendingTitle;
      let description = [
        `${data.newItems} item${data.newItems === 1 ? "" : "s"} queued for scraping`,
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

      if (syncType === "csv" && data.isFinished && itemCount === 0) {
        title = "No new items to import";
        description = "These items are already in your collection or orders.";
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

      if (data.isFinished) {
        void invalidateSyncResultQueries(queryClient);
      } else {
        void queryClient.invalidateQueries({ queryKey: ["syncSessions"] });
      }
    },
    [navigate, onComplete, queryClient],
  );

  const itemMutation = useMutation({
    mutationFn: sendItemSync,
    onSuccess: (data) => handleSuccess(data, "item"),
    onError: (error: Error) => {
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

  const csvMutation = useMutation({
    mutationFn: (userItems: UserItem[]) => sendItems(userItems),
    onSuccess: (data) => handleSuccess(data, "csv"),
    onError: (error: Error) => {
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

  const orderMutation = useMutation({
    mutationFn: (order: SyncOrder) => sendOrder(order),
    onSuccess: (data) => handleSuccess(data, "order"),
    onError: (error: Error) => {
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

  const orderItemMutation = useMutation({
    mutationFn: (orderItems: SyncOrderItems) => sendOrderItems(orderItems),
    onSuccess: (data) => handleSuccess(data, "order-item"),
    onError: (error: Error) => {
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

  const collectionMutation = useMutation({
    mutationFn: (items: SyncCollectionItem[]) => sendCollection(items),
    onSuccess: (data) => handleSuccess(data, "collection"),
    onError: (error: Error) => {
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

  const handleSyncCsvSubmit = useCallback(
    async (value: File | undefined): Promise<void> => {
      const { data: userItems, error } = await tryCatch(transformCSVData({ file: value }));
      if (error) {
        const toastId = toast.add({
          type: "error",
          title: SYNC_OPTION_META.csv.failureTitle,
          description: error instanceof Error ? error.message : "An error occurred",
          actionProps: {
            children: "View import history",
            onClick() {
              toast.close(toastId);
              void navigate({ to: "/sync" });
            },
          },
        });
        return;
      }

      await csvMutation.mutateAsync(userItems);
    },
    [csvMutation, navigate],
  );

  const handleSyncOrderSubmit = useCallback(
    async (values: SyncOrder): Promise<void> => {
      await orderMutation.mutateAsync(values);
    },
    [orderMutation],
  );

  const handleSyncCollectionSubmit = useCallback(
    async (values: SyncCollectionItem[]): Promise<void> => {
      await collectionMutation.mutateAsync(values);
    },
    [collectionMutation],
  );

  const handleSyncOrderItemSubmit = useCallback(
    async (values: SyncOrderItems): Promise<void> => {
      await orderItemMutation.mutateAsync(values);
    },
    [orderItemMutation],
  );

  const isSyncing =
    itemMutation.isPending ||
    csvMutation.isPending ||
    orderMutation.isPending ||
    orderItemMutation.isPending ||
    collectionMutation.isPending;

  return {
    handleSyncItemsSubmit: itemMutation.mutateAsync,
    handleSyncCsvSubmit,
    handleSyncOrderSubmit,
    handleSyncOrderItemSubmit,
    handleSyncCollectionSubmit,
    isSyncing,
  };
}
