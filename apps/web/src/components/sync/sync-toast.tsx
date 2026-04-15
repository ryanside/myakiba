import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SyncToastData = {
  readonly finished: boolean;
  readonly existingItems: number;
  readonly newItems: number;
};

function DetailRow({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function SyncToastContent({
  toastId,
  finished,
  existingItems,
  newItems,
}: SyncToastData & { readonly toastId: string | number }) {
  const totalItems = existingItems + newItems;
  const nothingToDo = totalItems === 0;

  return (
    <div className="bg-popover text-popover-foreground border-border flex w-[356px] flex-col gap-2 rounded-md border p-4 shadow-lg">
      <div className="flex items-center gap-2">
        <span
          className={cn("flex size-2 rounded-full", finished ? "bg-green-500" : "bg-amber-500")}
        />
        <p className="text-sm font-medium">
          {finished ? (nothingToDo ? "Already Synced" : "Sync Complete") : "Sync Queued"}
        </p>
      </div>

      <div className="text-muted-foreground space-y-1 text-xs">
        {finished ? (
          nothingToDo ? (
            <p>All items are already in your collection.</p>
          ) : (
            <DetailRow label="Items synced" value={totalItems} />
          )
        ) : (
          <>
            <DetailRow label="Processing" value={`${newItems} items`} />
            {existingItems > 0 && (
              <DetailRow label="Already synced" value={`${existingItems} items`} />
            )}
          </>
        )}
      </div>

      <div className="mt-1 flex gap-2">
        <Link
          to="/sync"
          onClick={() => toast.dismiss(toastId)}
          className={cn(buttonVariants({ size: "xs", variant: "outline" }), "flex-1")}
        >
          {finished ? "View History" : "View Status"}
        </Link>
        <button
          type="button"
          onClick={() => toast.dismiss(toastId)}
          className={cn(buttonVariants({ size: "xs" }), "flex-1")}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function showSyncToast(data: SyncToastData): void {
  toast.custom((id) => <SyncToastContent toastId={id} {...data} />);
}
