import type { ReactNode } from "react";
import { useState } from "react";
import { createFileRoute, useParams, notFound } from "@tanstack/react-router";
import { BackLink } from "@/components/ui/back-link";
import { SyncActionSheet } from "@/components/sync/sync-launcher";
import type { LaunchableSyncType } from "@/components/sync/sync-launcher-options";
import { ItemCollection } from "@/components/item/item-collection";
import { ItemDetails } from "@/components/item/item-details";
import { ItemHero } from "@/components/item/item-hero";
import { ItemNotFound } from "@/components/item/item-not-found";
import { useCollectionMutations, useCollectionOrderMutations } from "@/hooks/use-collection";
import { failureText, useRead, useResourceMutation } from "@/data/client";
import { items, refreshItemCommand } from "@/data/resources/item";

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
  const { externalId } = useParams({ from: "/(app)/item_/$externalId" });
  const [syncType, setSyncType] = useState<LaunchableSyncType | null>(null);

  const { data, isPending, isError, error: itemError } = useRead(items.detail, externalId);

  const isNotFound = data === null;

  const { data: resyncStatusData } = useRead(items.resyncStatus, externalId, {
    enabled: data != null,
  });

  const refresh = useResourceMutation(refreshItemCommand);

  const { data: itemRelatedOrders } = useRead(items.relatedOrders, externalId, {
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
  } = useRead(items.relatedCollection, externalId, { enabled: data != null });

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-y-4">
        <BackLink fallbackTo="/collection" text="Back" font="sans" className="self-start" />
        <div className="animate-data-in text-lg font-medium text-destructive">
          Error: {failureText(itemError)}
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

  return (
    <div className="flex flex-col gap-6 mx-auto max-w-352" aria-busy={isPending} aria-live="polite">
      {isPending ? <span className="sr-only">Loading item details</span> : null}
      <BackLink fallbackTo="/collection" text="Back" font="sans" className="self-start" />

      <ItemHero
        item={item}
        isLoading={isPending}
        externalId={externalId}
        resyncStatus={resyncStatusData?.status ?? "idle"}
        cooldownExpiresAt={resyncStatusData?.cooldownExpiresAt ?? null}
        isResyncPending={refresh.isPending}
        onRequestResync={() => refresh.run(externalId)}
        isWishlisted={data?.isWishlisted ?? false}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5">
        <ItemDetails item={item} isLoading={isPending} />
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
