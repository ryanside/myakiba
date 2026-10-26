import { PackageSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { ItemSyncActions } from "@/components/item/item-sync-actions";
import { STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { BackLink } from "@/components/ui/back-link";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
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
      <Empty className={STATE_PANEL_CLASS_NAME}>
        <EmptyHeader>
          <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
            <HugeiconsIcon icon={PackageSearchIcon} className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Item not in the Item Database yet</EmptyTitle>
          <EmptyDescription>
            MyFigureCollection item #{externalId} isn&apos;t in myakiba yet. Add it to the item
            database.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="sm:max-w-2xl">
          <ItemSyncActions
            onSyncCollection={() => onSyncTypeChange("collection")}
            onSyncOrder={() => onSyncTypeChange("order")}
            onSyncItems={() => onSyncTypeChange("item")}
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
