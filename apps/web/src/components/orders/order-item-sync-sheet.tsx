import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { type ComponentProps, useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PlusIcon, type PlusIconHandle } from "@/components/ui/plus";
import { SYNC_OPTION_META } from "@/lib/sync";
import { useUserPreferences } from "@/hooks/use-collection";
import { useSyncMutations } from "@/hooks/use-sync-mutations";
import SyncOrderItemForm from "@/components/sync/sync-order-item-form";

type OrderItemSyncSheetProps = {
  readonly orderId: string;
  readonly label?: string;
  readonly className?: string;
  readonly variant?: ComponentProps<typeof Button>["variant"];
  readonly size?: ComponentProps<typeof Button>["size"];
};

export function OrderItemSyncSheet({
  orderId,
  label = "Add Item",
  className,
  variant = "default",
  size = "sm",
}: OrderItemSyncSheetProps) {
  const queryClient = useQueryClient();
  const { currency } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const addItemIconRef = useRef<PlusIconHandle>(null);

  const handleComplete = useCallback((): void => {
    setOpen(false);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
      queryClient.invalidateQueries({ queryKey: ["orderStats"] }),
      queryClient.invalidateQueries({ queryKey: ["orderItems", orderId] }),
    ]);
  }, [orderId, queryClient]);

  const { handleSyncOrderItemSubmit, isSyncing } = useSyncMutations(queryClient, handleComplete);
  const meta = SYNC_OPTION_META["order-item"];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant={variant}
            size={size}
            className={className}
            aria-label={label}
            onMouseEnter={() => addItemIconRef.current?.startAnimation()}
            onMouseLeave={() => addItemIconRef.current?.stopAnimation()}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
            ) : (
              <PlusIcon ref={addItemIconRef} size={17} />
            )}
            {label}
          </Button>
        }
      />
      <SheetContent side="right" className="sm:max-w-lg! overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{meta.title}</SheetTitle>
          <SheetDescription>{meta.description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <SyncOrderItemForm
            orderId={orderId}
            handleSyncOrderItemSubmit={handleSyncOrderItemSubmit}
            currency={currency}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
