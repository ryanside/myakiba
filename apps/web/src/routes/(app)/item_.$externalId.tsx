import type { ReactNode } from "react";
import { useState } from "react";
import { createFileRoute, useParams, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BackLink } from "@/components/ui/back-link";
import { SyncActionSheet } from "@/components/sync/sync-launcher";
import type { LaunchableSyncType } from "@/components/sync/sync-launcher-options";
import { ItemCollection } from "@/components/item/item-collection";
import { ItemDetails } from "@/components/item/item-details";
import { ItemHero } from "@/components/item/item-hero";
import { ItemNotFound } from "@/components/item/item-not-found";
import { normalizeScale } from "@myakiba/contracts/shared/scale";
import { useCollectionMutations, useCollectionOrderMutations } from "@/hooks/use-collection";
import {
  getItem,
  getItemRelatedCollection,
  getItemRelatedOrders,
  getResyncStatus,
  requestResync,
} from "@/queries/item";

export const Route = createFileRoute("/(app)/item_/$externalId")({
  parseParams: ({ externalId }) => {
    if (!/^\d+$/.test(externalId)) {
      throw notFound();
    }
    return { externalId: Number(externalId) };
  },
  stringifyParams: ({ externalId }) => ({ externalId: String(externalId) }),
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `item ${params.externalId} details`,
      },
      {
        title: `Item ${params.externalId} - myakiba`,
      },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const queryClient = useQueryClient();
  const { externalId } = useParams({ from: "/(app)/item_/$externalId" });
  const [syncType, setSyncType] = useState<LaunchableSyncType | null>(null);

  const {
    data,
    isPending,
    isError,
    error: itemError,
  } = useQuery({
    queryKey: ["item", externalId],
    queryFn: () => getItem(externalId),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const isNotFound = data === null;

  const { data: resyncStatusData } = useQuery({
    queryKey: ["item", externalId, "resyncStatus"],
    queryFn: () => getResyncStatus(externalId),
    staleTime: 1000 * 30,
    retry: false,
    enabled: data != null,
  });

  const requestResyncMutation = useMutation({
    mutationFn: () => requestResync(externalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["item", externalId, "resyncStatus"] });
      toast.success("Update requested");
    },
    onError: (mutationError) => {
      toast.error("Failed to request update", {
        description: mutationError.message,
      });
    },
  });

  const { data: itemRelatedOrders } = useQuery({
    queryKey: ["item", externalId, "itemRelatedOrders"],
    queryFn: () => getItemRelatedOrders(externalId),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: data != null,
  });

  const { handleEditCollectionItem, handleDeleteCollectionItems } = useCollectionMutations();
  const {
    handleAddCollectionItemsToOrder,
    handleAddCollectionItemsToNewOrder,
    isCollectionOrderPending,
  } = useCollectionOrderMutations();

  const {
    data: itemRelatedCollection,
    isPending: isPendingItemRelatedCollection,
    isError: isErrorItemRelatedCollection,
    error: errorItemRelatedCollection,
  } = useQuery({
    queryKey: ["item", externalId, "itemRelatedCollection"],
    queryFn: () => getItemRelatedCollection(externalId),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: data != null,
  });

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-y-4">
        <BackLink to="/collection" text="Back" font="sans" className="self-start" />
        <div className="animate-data-in text-lg font-medium text-destructive">
          Error: {itemError.message}
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <ItemNotFound externalId={externalId} syncType={syncType} onSyncTypeChange={setSyncType} />
    );
  }

  const item = data?.item;
  const collectionItems = itemRelatedCollection?.collection ?? [];
  const ordersList = itemRelatedOrders?.orders ?? [];
  const scale = normalizeScale(typeof item?.scale === "string" ? item.scale : null);

  return (
    <div className="flex flex-col gap-6 mx-auto max-w-352" aria-busy={isPending} aria-live="polite">
      {isPending ? <span className="sr-only">Loading item details</span> : null}
      <BackLink to="/collection" text="Back" font="sans" className="self-start" />

      <ItemHero
        item={item}
        isLoading={isPending}
        externalId={externalId}
        scale={scale}
        resyncStatus={resyncStatusData?.status ?? "idle"}
        cooldownExpiresAt={resyncStatusData?.cooldownExpiresAt ?? null}
        isResyncPending={requestResyncMutation.isPending}
        onRequestResync={() => requestResyncMutation.mutate()}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5">
        <ItemDetails item={item} scale={scale} isLoading={isPending} />
        <ItemCollection
          item={item}
          externalId={externalId}
          collectionItems={collectionItems}
          ordersList={ordersList}
          isPending={isPending || isPendingItemRelatedCollection}
          isError={isErrorItemRelatedCollection}
          errorMessage={errorItemRelatedCollection?.message}
          onSyncCollection={() => setSyncType("collection")}
          onSyncOrder={() => setSyncType("order")}
          onEditCollectionItem={handleEditCollectionItem}
          onDeleteCollectionItems={handleDeleteCollectionItems}
          onMoveToExistingOrder={handleAddCollectionItemsToOrder}
          onMoveToNewOrder={handleAddCollectionItemsToNewOrder}
          isCollectionOrderPending={isCollectionOrderPending}
        />
      </div>

      <SyncActionSheet
        syncType={syncType}
        onSyncTypeChange={setSyncType}
        initialItemExternalId={String(externalId)}
      />
    </div>
  );
}
