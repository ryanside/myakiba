import { useCallback } from "react";
import { useMutation, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { tryCatch } from "@myakiba/utils";
import type { SyncCollectionItem, SyncOrder, UserItem } from "@myakiba/types";
import { transformCSVData } from "@/lib/sync";
import { sendCollection, sendItems, sendOrder } from "@/queries/sync";

type CsvMutationData = Awaited<ReturnType<typeof sendItems>>;
type OrderMutationData = Awaited<ReturnType<typeof sendOrder>>;
type CollectionMutationData = Awaited<ReturnType<typeof sendCollection>>;

type SyncMutationResult = {
  readonly syncSessionId: string;
  readonly jobId: string | null | undefined;
  readonly isFinished: boolean;
  readonly status: string;
};

type UseSyncMutationsOnComplete = (data: SyncMutationResult) => void;

export type UseSyncMutationsReturn = {
  readonly csvMutation: UseMutationResult<CsvMutationData, Error, UserItem[]>;
  readonly orderMutation: UseMutationResult<OrderMutationData, Error, SyncOrder>;
  readonly collectionMutation: UseMutationResult<
    CollectionMutationData,
    Error,
    SyncCollectionItem[]
  >;
  readonly mutateCsvAsync: (userItems: UserItem[]) => Promise<CsvMutationData>;
  readonly mutateOrderAsync: (order: SyncOrder) => Promise<OrderMutationData>;
  readonly mutateCollectionAsync: (items: SyncCollectionItem[]) => Promise<CollectionMutationData>;
  readonly handleSyncCsvSubmit: (value: File | undefined) => Promise<void>;
  readonly handleSyncOrderSubmit: (values: SyncOrder) => Promise<void>;
  readonly handleSyncCollectionSubmit: (values: SyncCollectionItem[]) => Promise<void>;
  readonly isSyncing: boolean;
};

export function useSyncMutations(
  queryClient: QueryClient,
  onComplete?: UseSyncMutationsOnComplete,
): UseSyncMutationsReturn {
  const handleFormResult = useCallback(
    (data: SyncMutationResult): void => {
      onComplete?.(data);

      if (data.isFinished) {
        toast.success(data.status);
        void queryClient.invalidateQueries();
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["syncSessions"],
      });
    },
    [onComplete, queryClient],
  );

  const csvMutation = useMutation({
    mutationFn: (userItems: UserItem[]) => sendItems(userItems),
    onSuccess: (data: CsvMutationData): void =>
      handleFormResult({
        syncSessionId: data.syncSessionId,
        jobId: data.jobId,
        isFinished: data.isFinished,
        status: data.status,
      }),
    onError: (error: Error): void => {
      toast.error("Failed to submit CSV.", {
        description: error.message,
      });
    },
  });

  const orderMutation = useMutation({
    mutationFn: (order: SyncOrder) => sendOrder(order),
    onSuccess: (data: OrderMutationData): void =>
      handleFormResult({
        syncSessionId: data.syncSessionId,
        jobId: data.jobId,
        isFinished: data.isFinished,
        status: data.status,
      }),
    onError: (error: Error): void => {
      toast.error("Failed to submit order.", {
        description: error.message,
      });
    },
  });

  const collectionMutation = useMutation({
    mutationFn: (items: SyncCollectionItem[]) => sendCollection(items),
    onSuccess: (data: CollectionMutationData): void =>
      handleFormResult({
        syncSessionId: data.syncSessionId,
        jobId: data.jobId,
        isFinished: data.isFinished,
        status: data.status,
      }),
    onError: (error: Error): void => {
      toast.error("Failed to submit collection.", {
        description: error.message,
      });
    },
  });

  const mutateCsvAsync = useCallback(
    (userItems: UserItem[]): Promise<CsvMutationData> => csvMutation.mutateAsync(userItems),
    [csvMutation],
  );

  const mutateOrderAsync = useCallback(
    (order: SyncOrder): Promise<OrderMutationData> => orderMutation.mutateAsync(order),
    [orderMutation],
  );

  const mutateCollectionAsync = useCallback(
    (items: SyncCollectionItem[]): Promise<CollectionMutationData> =>
      collectionMutation.mutateAsync(items),
    [collectionMutation],
  );

  const handleSyncCsvSubmit = useCallback(
    async (value: File | undefined): Promise<void> => {
      const { data: userItems, error } = await tryCatch(transformCSVData({ file: value }));
      if (error) {
        toast.error(error instanceof Error ? error.message : "An error occurred");
        return;
      }

      await mutateCsvAsync(userItems);
    },
    [mutateCsvAsync],
  );

  const handleSyncOrderSubmit = useCallback(
    async (values: SyncOrder): Promise<void> => {
      await mutateOrderAsync(values);
    },
    [mutateOrderAsync],
  );

  const handleSyncCollectionSubmit = useCallback(
    async (values: SyncCollectionItem[]): Promise<void> => {
      await mutateCollectionAsync(values);
    },
    [mutateCollectionAsync],
  );

  const isSyncing =
    csvMutation.isPending || orderMutation.isPending || collectionMutation.isPending;

  return {
    csvMutation,
    orderMutation,
    collectionMutation,
    mutateCsvAsync,
    mutateOrderAsync,
    mutateCollectionAsync,
    handleSyncCsvSubmit,
    handleSyncOrderSubmit,
    handleSyncCollectionSubmit,
    isSyncing,
  };
}
