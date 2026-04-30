import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { SyncType } from "@myakiba/contracts/shared/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SYNC_OPTION_META } from "@/lib/sync";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import { useSyncMutations } from "@/hooks/use-sync-mutations";
import { useUserPreferences } from "@/hooks/use-user-preferences";
type SyncSheetButtonProps = {
  readonly syncType: Extract<SyncType, "collection" | "order">;
  readonly label: string;
  readonly className?: string;
};

export function SyncSheetButton({ syncType, label, className }: SyncSheetButtonProps) {
  const queryClient = useQueryClient();
  const { currency } = useUserPreferences();
  const [open, setOpen] = useState(false);

  const { handleSyncOrderSubmit, handleSyncCollectionSubmit, isSyncing } = useSyncMutations(
    queryClient,
    () => {
      setOpen(false);
    },
  );

  const meta = SYNC_OPTION_META[syncType];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="default" className={className} aria-label={label} disabled={isSyncing}>
            {isSyncing ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
            ) : (
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            )}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        }
      />
      <SheetContent side="right" className="sm:max-w-lg! overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{meta.title}</SheetTitle>
          <SheetDescription>{meta.description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {syncType === "order" && (
            <SyncOrderForm handleSyncOrderSubmit={handleSyncOrderSubmit} currency={currency} />
          )}
          {syncType === "collection" && (
            <SyncCollectionForm
              handleSyncCollectionSubmit={handleSyncCollectionSubmit}
              currency={currency}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
