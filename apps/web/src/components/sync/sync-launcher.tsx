import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import SyncCsvForm from "@/components/sync/sync-csv-form";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import { useSyncMutations } from "@/hooks/use-sync-mutations";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { SYNC_OPTION_META } from "@/lib/sync";
import type { LaunchableSyncType } from "@/components/sync/sync-launcher-options";

type SyncActionSheetProps = {
  readonly syncType: LaunchableSyncType | null;
  readonly onSyncTypeChange: (syncType: LaunchableSyncType | null) => void;
  readonly side?: "left" | "right";
  readonly initialItemExternalId?: string;
};

export function SyncActionSheet({
  syncType,
  onSyncTypeChange,
  side = "left",
  initialItemExternalId,
}: SyncActionSheetProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const { currency: userCurrency } = useUserPreferences();

  const { handleSyncCsvSubmit, handleSyncOrderSubmit, handleSyncCollectionSubmit } =
    useSyncMutations(queryClient, () => {
      onSyncTypeChange(null);
    });

  return (
    <Sheet
      open={syncType !== null}
      onOpenChange={(open) => {
        if (!open) {
          onSyncTypeChange(null);
        }
      }}
    >
      <SheetContent side={side} className="overflow-y-auto sm:max-w-lg!">
        {syncType ? (
          <>
            <SheetHeader>
              <SheetTitle>{SYNC_OPTION_META[syncType].title}</SheetTitle>
              <SheetDescription>{SYNC_OPTION_META[syncType].description}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              {syncType === "csv" ? (
                <SyncCsvForm handleSyncCsvSubmit={handleSyncCsvSubmit} />
              ) : null}
              {syncType === "order" ? (
                <SyncOrderForm
                  handleSyncOrderSubmit={handleSyncOrderSubmit}
                  currency={userCurrency}
                  initialItemExternalId={initialItemExternalId}
                />
              ) : null}
              {syncType === "collection" ? (
                <SyncCollectionForm
                  handleSyncCollectionSubmit={handleSyncCollectionSubmit}
                  currency={userCurrency}
                  initialItemExternalId={initialItemExternalId}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
