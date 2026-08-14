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
import { transformCSVData } from "@/lib/sync";
import { invalidateSyncResultQueries } from "@/lib/mutation-query-invalidation";
import { sendCollection, sendItems, sendOrder, sendOrderItems } from "@/queries/sync";
import type { SyncResponse } from "@/queries/sync";
import { toast } from "@/components/ui/toast";

export type UseSyncMutationsReturn = {
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
    (data: SyncResponse): void => {
      onComplete?.();

      const itemCount = data.existingItemsToInsert + data.newItems;
      let title = "Sync Queued";
      let description = [
        `Processing ${data.newItems} items`,
        data.existingItemsToInsert > 0 ? `${data.existingItemsToInsert} already synced` : null,
      ]
        .filter((part) => part !== null)
        .join(", ");

      if (data.isFinished) {
        title = "Sync Complete";
        description = `${itemCount} items synced`;
      }

      if (data.isFinished && itemCount === 0) {
        title = "Already Synced";
        description = "All items are already in your collection.";
      }

      const toastId = toast.add({
        type: data.isFinished ? "success" : "info",
        title,
        description,
        actionProps: {
          children: "View Status",
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

  const csvMutation = useMutation({
    mutationFn: (userItems: UserItem[]) => sendItems(userItems),
    onSuccess: handleSuccess,
    onError: (error: Error) => {
      const toastId = toast.add({
        type: "error",
        title: "Sync Failed",
        description: error.message.trim() || "Failed to submit CSV.",
        actionProps: {
          children: "View History",
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
    onSuccess: handleSuccess,
    onError: (error: Error) => {
      const toastId = toast.add({
        type: "error",
        title: "Sync Failed",
        description: error.message.trim() || "Failed to submit order.",
        actionProps: {
          children: "View History",
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
    onSuccess: handleSuccess,
    onError: (error: Error) => {
      const toastId = toast.add({
        type: "error",
        title: "Sync Failed",
        description: error.message.trim() || "Failed to submit order items.",
        actionProps: {
          children: "View History",
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
    onSuccess: handleSuccess,
    onError: (error: Error) => {
      const toastId = toast.add({
        type: "error",
        title: "Sync Failed",
        description: error.message.trim() || "Failed to submit collection.",
        actionProps: {
          children: "View History",
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
          title: "Sync Failed",
          description: error instanceof Error ? error.message : "An error occurred",
          actionProps: {
            children: "View History",
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
    csvMutation.isPending ||
    orderMutation.isPending ||
    orderItemMutation.isPending ||
    collectionMutation.isPending;

  return {
    handleSyncCsvSubmit,
    handleSyncOrderSubmit,
    handleSyncOrderItemSubmit,
    handleSyncCollectionSubmit,
    isSyncing,
  };
}
