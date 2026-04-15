import { useCallback } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

const toastSyncError =
  (title: string) =>
  (error: Error): void => {
    const message = error.message.trim();
    toast.error(message.length > 0 ? message : title);
  };

export function useSyncMutations(
  queryClient: QueryClient,
  onComplete?: () => void,
): UseSyncMutationsReturn {
  const handleSuccess = useCallback(
    (data: SyncResponse): void => {
      onComplete?.();

      showSyncToast({
        finished: data.isFinished,
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
    onError: toastSyncError("Failed to submit CSV."),
  });

  const orderMutation = useMutation({
    mutationFn: (order: SyncOrder) => sendOrder(order),
    onSuccess: handleSuccess,
    onError: toastSyncError("Failed to submit order."),
  });

  const orderItemMutation = useMutation({
    mutationFn: (orderItems: SyncOrderItems) => sendOrderItems(orderItems),
    onSuccess: handleSuccess,
    onError: toastSyncError("Failed to submit order items."),
  });

  const collectionMutation = useMutation({
    mutationFn: (items: SyncCollectionItem[]) => sendCollection(items),
    onSuccess: handleSuccess,
    onError: toastSyncError("Failed to submit collection."),
  });

  const handleSyncCsvSubmit = useCallback(
    async (value: File | undefined): Promise<void> => {
      const { data: userItems, error } = await tryCatch(transformCSVData({ file: value }));
      if (error) {
        toast.error(error instanceof Error ? error.message : "An error occurred");
        return;
      }

      await csvMutation.mutateAsync(userItems);
    },
    [csvMutation.mutateAsync],
  );

  const handleSyncOrderSubmit = useCallback(
    async (values: SyncOrder): Promise<void> => {
      await orderMutation.mutateAsync(values);
    },
    [orderMutation.mutateAsync],
  );

  const handleSyncCollectionSubmit = useCallback(
    async (values: SyncCollectionItem[]): Promise<void> => {
      await collectionMutation.mutateAsync(values);
    },
    [collectionMutation.mutateAsync],
  );

  const handleSyncOrderItemSubmit = useCallback(
    async (values: SyncOrderItems): Promise<void> => {
      await orderItemMutation.mutateAsync(values);
    },
    [orderItemMutation.mutateAsync],
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
