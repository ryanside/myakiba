import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  FileUploadIcon,
  LibraryIcon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SyncType } from "@myakiba/contracts/shared/types";
import { SYNC_TYPE_CONFIG, SYNC_OPTION_META } from "@/lib/sync";
import SyncCsvForm from "@/components/sync/sync-csv-form";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import type { RouterAppContext } from "@/routes/__root";
import { useSyncMutations } from "@/hooks/use-sync-mutations";

type LaunchableSyncType = Extract<SyncType, "collection" | "csv" | "order">;

const SYNC_OPTIONS: readonly {
  readonly type: LaunchableSyncType;
  readonly icon: typeof LibraryIcon;
  readonly description: string;
}[] = [
  { type: "collection", icon: LibraryIcon, description: "Add items by MFC ID" },
  {
    type: "order",
    icon: PackageIcon,
    description: "Create an order with MFC items",
  },
  {
    type: "csv",
    icon: FileUploadIcon,
    description: "Import from MFC CSV export",
  },
];

type SyncWidgetProps = {
  readonly session: RouterAppContext["session"];
  readonly TriggerWrapper: React.ReactElement;
};

export default function SyncWidget({ session, TriggerWrapper }: SyncWidgetProps) {
  const queryClient = useQueryClient();
  const [syncType, setSyncType] = useState<LaunchableSyncType | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const userCurrency = session?.user.currency || "USD";

  const { handleSyncCsvSubmit, handleSyncOrderSubmit, handleSyncCollectionSubmit } =
    useSyncMutations(queryClient, () => {
      setSyncType(null);
    });

  const handleOptionSelect = useCallback((type: LaunchableSyncType) => {
    setPopoverOpen(false);
    setSyncType(type);
  }, []);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger render={TriggerWrapper} />
        <PopoverContent align="start" className="w-56 p-1">
          {SYNC_OPTIONS.map((option) => {
            const config = SYNC_TYPE_CONFIG[option.type];
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => handleOptionSelect(option.type)}
                className="group/item flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent cursor-pointer"
              >
                <HugeiconsIcon
                  icon={option.icon}
                  className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/item:text-foreground"
                />
                <span className="min-w-0 flex-1 text-sm">{config.label}</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-3 shrink-0 text-muted-foreground/50 -translate-x-0.5 opacity-0 transition-all duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100"
                />
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      <Sheet
        open={syncType !== null}
        onOpenChange={(open) => {
          if (!open) setSyncType(null);
        }}
      >
        <SheetContent side="left" className="sm:max-w-lg! overflow-y-auto">
          {syncType && (
            <>
              <SheetHeader>
                <SheetTitle>{SYNC_OPTION_META[syncType].title}</SheetTitle>
                <SheetDescription>{SYNC_OPTION_META[syncType].description}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                {syncType === "csv" && <SyncCsvForm handleSyncCsvSubmit={handleSyncCsvSubmit} />}
                {syncType === "order" && (
                  <SyncOrderForm
                    handleSyncOrderSubmit={handleSyncOrderSubmit}
                    currency={userCurrency}
                  />
                )}
                {syncType === "collection" && (
                  <SyncCollectionForm
                    handleSyncCollectionSubmit={handleSyncCollectionSubmit}
                    currency={userCurrency}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
