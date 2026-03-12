import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  FileUploadIcon,
  LibraryIcon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import type { ComponentType, PropsWithChildren } from "react";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SyncType } from "@myakiba/types";
import { SYNC_TYPE_CONFIG, SYNC_OPTION_META } from "@/lib/sync";
import SyncCsvForm from "@/components/sync/sync-csv-form";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import type { RouterAppContext } from "@/routes/__root";
import { PlusIcon, type PlusIconHandle } from "@/components/ui/plus";
import { useSyncMutations } from "@/hooks/use-sync-mutations";

const SYNC_OPTIONS: readonly {
  readonly type: SyncType;
  readonly icon: typeof LibraryIcon;
  readonly description: string;
}[] = [
  { type: "collection", icon: LibraryIcon, description: "Add items by MFC ID" },
  { type: "order", icon: PackageIcon, description: "Create an order with MFC items" },
  { type: "csv", icon: FileUploadIcon, description: "Import from MFC CSV export" },
];

type SyncWidgetProps = {
  readonly session: RouterAppContext["session"];
  readonly TriggerWrapper?: ComponentType<PropsWithChildren<Record<string, unknown>>>;
  readonly triggerWrapperProps?: Record<string, unknown>;
};

export default function SyncWidget({
  session,
  TriggerWrapper,
  triggerWrapperProps = {},
}: SyncWidgetProps) {
  const queryClient = useQueryClient();
  const [syncType, setSyncType] = useState<SyncType | null>(null);
  const addItemsIconRef = useRef<PlusIconHandle>(null);

  const userCurrency = session?.user.currency || "USD";

  const { handleSyncCsvSubmit, handleSyncOrderSubmit, handleSyncCollectionSubmit } =
    useSyncMutations(queryClient, () => {
      setSyncType(null);
    });

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          {TriggerWrapper ? (
            <TriggerWrapper
              aria-label="Sync Items"
              onMouseEnter={() => addItemsIconRef.current?.startAnimation()}
              onMouseLeave={() => addItemsIconRef.current?.stopAnimation()}
              {...triggerWrapperProps}
            >
              <PlusIcon ref={addItemsIconRef} size={17} />
              <span>Sync Items</span>
            </TriggerWrapper>
          ) : (
            <Button
              variant="primary"
              size="sm"
              autoHeight={true}
              aria-label="Add items"
              onMouseEnter={() => addItemsIconRef.current?.startAnimation()}
              onMouseLeave={() => addItemsIconRef.current?.stopAnimation()}
            >
              <PlusIcon ref={addItemsIconRef} size={17} />
              Add items
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="max-h-[400px] overflow-y-auto">
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                {SYNC_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const config = SYNC_TYPE_CONFIG[option.type];
                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setSyncType(option.type)}
                      className="flex w-full items-center gap-3 rounded-lg cursor-pointer border p-3 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center">
                        <HugeiconsIcon icon={Icon} className="size-4 dark:text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t pt-2">
                <PopoverClose asChild>
                  <Link to="/sync">
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      View sync history
                      <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
                    </Button>
                  </Link>
                </PopoverClose>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Sheet
        open={syncType !== null}
        onOpenChange={(open) => {
          if (!open) setSyncType(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
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
