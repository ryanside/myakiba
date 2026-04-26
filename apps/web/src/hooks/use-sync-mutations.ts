import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { tryCatch } from "@myakiba/utils/result";
import type {
  SyncCollectionItem,
  SyncOrder,
  SyncOrderItems,
  UserItem,
} from "@myakiba/contracts/sync/types";
import { transformCSVData } from "@/lib/sync";
import { sendCollection, sendItems, sendOrder, sendOrderItems } from "@/queries/sync";
import { showSyncToast } from "@/components/sync/sync-toast";

type SyncResponse = {
  readonly syncSessionId: string;
  readonly isFinished: boolean;
  readonly existingItemsToInsert: number;
  readonly newItems: number;
};

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
  const handleSuccess = useCallback(
    (data: SyncResponse): void => {
      onComplete?.();

      showSyncToast({
        state: data.isFinished ? "success" : "queued",
        sessionId: data.syncSessionId,
        existingItems: data.existingItemsToInsert,
        newItems: data.newItems,
      });

      if (data.isFinished) {
        void queryClient.invalidateQueries();
      } else {
        void queryClient.invalidateQueries({ queryKey: ["syncSessions"] });
      }
    },
    [onComplete, queryClient],
  );

  const csvMutation = useMutation({
    mutationFn: (userItems: UserItem[]) => sendItems(userItems),
    onSuccess: handleSuccess,
    onError: (error: Error) =>
      showSyncToast({ state: "error", message: error.message.trim() || "Failed to submit CSV." }),
  });

  const orderMutation = useMutation({
    mutationFn: (order: SyncOrder) => sendOrder(order),
    onSuccess: handleSuccess,
    onError: (error: Error) =>
      showSyncToast({ state: "error", message: error.message.trim() || "Failed to submit order." }),
  });

  const orderItemMutation = useMutation({
    mutationFn: (orderItems: SyncOrderItems) => sendOrderItems(orderItems),
    onSuccess: handleSuccess,
    onError: (error: Error) =>
      showSyncToast({
        state: "error",
        message: error.message.trim() || "Failed to submit order items.",
      }),
  });

  const collectionMutation = useMutation({
    mutationFn: (items: SyncCollectionItem[]) => sendCollection(items),
    onSuccess: handleSuccess,
    onError: (error: Error) =>
      showSyncToast({
        state: "error",
        message: error.message.trim() || "Failed to submit collection.",
      }),
  });

  const handleSyncCsvSubmit = useCallback(
    async (value: File | undefined): Promise<void> => {
      const { data: userItems, error } = await tryCatch(transformCSVData({ file: value }));
      if (error) {
        showSyncToast({
          state: "error",
          message: error instanceof Error ? error.message : "An error occurred",
        });
        return;
      }

      await csvMutation.mutateAsync(userItems);
    },
    [csvMutation],
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
