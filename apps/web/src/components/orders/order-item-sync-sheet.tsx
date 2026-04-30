import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { useCallback, useState } from "react";
import type { ComponentProps } from "react";
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
import { SYNC_OPTION_META } from "@/lib/sync";
import { useUserPreferences } from "@/hooks/use-user-preferences";
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

  const handleComplete = useCallback((): void => {
    setOpen(false);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
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
            disabled={isSyncing}
          >
            {isSyncing ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
            ) : (
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
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
