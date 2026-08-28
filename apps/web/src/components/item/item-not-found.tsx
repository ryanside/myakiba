import type { ReactNode } from "react";
import { ItemSyncActions } from "@/components/item/item-sync-actions";
import { BackLink } from "@/components/ui/back-link";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { SyncActionSheet } from "@/components/sync/sync-launcher";
import type { LaunchableSyncType } from "@/components/sync/sync-launcher-options";

export function ItemNotFound({
  externalId,
  syncType,
  onSyncTypeChange,
}: {
  readonly externalId: number;
  readonly syncType: LaunchableSyncType | null;
  readonly onSyncTypeChange: (syncType: LaunchableSyncType | null) => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-6 mx-auto max-w-352">
      <BackLink fallbackTo="/collection" text="Back" font="sans" className="self-start" />
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle>Item not in the Item Database yet</EmptyTitle>
          <EmptyDescription>
            MFC item #{externalId} hasn&apos;t been synced to myakiba. Sync it now to add it to your
            collection or a new order.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ItemSyncActions
            onSyncCollection={() => onSyncTypeChange("collection")}
            onSyncOrder={() => onSyncTypeChange("order")}
            labels={{ collection: "Sync as Collection", order: "Sync as Order" }}
          />
          <a
            href={`https://myfigurecollection.net/item/${externalId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:underline"
          >
            View myfigurecollection.net/item/{externalId}
          </a>
        </EmptyContent>
      </Empty>
      <SyncActionSheet
        syncType={syncType}
        onSyncTypeChange={onSyncTypeChange}
        initialItemExternalId={String(externalId)}
      />
    </div>
  );
}
