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
import { requireExtension } from "@/lib/extension-gate";
import { importSyncItems } from "@/data/extension-run";

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
  send: (input: Input) => Promise<SyncResponse>,
  input: Input,
): Promise<SyncSubmit> {
  if (!(await requireExtension())) return "not_sent";
  await send(input);
  return "sent";
}

export function useSyncMutations(
  queryClient: QueryClient,
  onComplete?: () => void,
): UseSyncMutationsReturn {
  const navigate = useNavigate();

  const handleSuccess = useCallback(
    (data: SyncResponse, syncType: SyncType): void => {
      onComplete?.();
      if (data.jobId !== null && data.missingMfcItemIds.length > 0) {
        importSyncItems({
          sessionId: data.syncSessionId,
          jobId: data.jobId,
          mfcItemIds: data.missingMfcItemIds,
        });
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

  const handleSyncItemsSubmit = useCallback(
    (values: ItemSyncInput) => sendWithExtension(itemMutation.mutateAsync, values),
    [itemMutation],
  );

  const handleSyncCsvSubmit = useCallback(
    async (value: File | undefined): Promise<SyncSubmit> => {
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
        return "not_sent";
      }

      return sendWithExtension(csvMutation.mutateAsync, userItems);
    },
    [csvMutation, navigate],
  );

  const handleSyncOrderSubmit = useCallback(
    (values: SyncOrder) => sendWithExtension(orderMutation.mutateAsync, values),
    [orderMutation],
  );

  const handleSyncCollectionSubmit = useCallback(
    (values: SyncCollectionItem[]) => sendWithExtension(collectionMutation.mutateAsync, values),
    [collectionMutation],
  );

  const handleSyncOrderItemSubmit = useCallback(
    (values: SyncOrderItems) => sendWithExtension(orderItemMutation.mutateAsync, values),
    [orderItemMutation],
  );

  const isSyncing =
    itemMutation.isPending ||
    csvMutation.isPending ||
    orderMutation.isPending ||
    orderItemMutation.isPending ||
    collectionMutation.isPending;

  return {
    handleSyncItemsSubmit,
    handleSyncCsvSubmit,
    handleSyncOrderSubmit,
    handleSyncOrderItemSubmit,
    handleSyncCollectionSubmit,
    isSyncing,
  };
}
