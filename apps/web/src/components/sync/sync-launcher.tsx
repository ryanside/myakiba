import type { IconSvgElement } from "@hugeicons/react";
import { FileUploadIcon, LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { SyncType } from "@myakiba/contracts/shared/types";
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

export type LaunchableSyncType = Extract<SyncType, "collection" | "csv" | "order">;

export type SyncLauncherOption = {
  readonly type: LaunchableSyncType;
  readonly icon: IconSvgElement;
  readonly description: string;
  readonly keywords: readonly string[];
};

export const LAUNCHABLE_SYNC_OPTIONS = [
  {
    type: "collection",
    icon: LibraryIcon,
    description: "Add items by MFC ID",
    keywords: ["sync", "collection", "item", "mfc"],
  },
  {
    type: "order",
    icon: PackageIcon,
    description: "Create an order with MFC items",
    keywords: ["sync", "order", "purchase", "mfc"],
  },
  {
    type: "csv",
    icon: FileUploadIcon,
    description: "Import from MFC CSV export",
    keywords: ["sync", "csv", "import", "upload"],
  },
] as const satisfies readonly SyncLauncherOption[];

type SyncActionSheetProps = {
  readonly syncType: LaunchableSyncType | null;
  readonly onSyncTypeChange: (syncType: LaunchableSyncType | null) => void;
  readonly side?: "left" | "right";
};

export function SyncActionSheet({
  syncType,
  onSyncTypeChange,
  side = "left",
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
                />
              ) : null}
              {syncType === "collection" ? (
                <SyncCollectionForm
                  handleSyncCollectionSubmit={handleSyncCollectionSubmit}
                  currency={userCurrency}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
