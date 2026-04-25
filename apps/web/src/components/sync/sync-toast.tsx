import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import type { SyncTerminalState } from "@myakiba/contracts/sync/schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SyncToastState = SyncTerminalState | "queued";

type SyncToastData = {
  readonly state: SyncToastState;
  readonly sessionId?: string;
  readonly message?: string;
  readonly description?: string;
  readonly existingItems?: number;
  readonly newItems?: number;
};

const STATE_CONFIG: Record<SyncToastState, { readonly dot: string; readonly title: string }> = {
  queued: { dot: "bg-warning", title: "Sync Queued" },
  success: { dot: "bg-success", title: "Sync Complete" },
  partial: { dot: "bg-warning", title: "Sync Partial" },
  timeout: { dot: "bg-info", title: "Sync Timed Out" },
  error: { dot: "bg-destructive", title: "Sync Failed" },
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
  state,
  sessionId,
  message,
  description,
  existingItems,
  newItems,
}: SyncToastData & { readonly toastId: string | number }) {
  const hasCounts = existingItems !== undefined && newItems !== undefined;
  const nothingToDo = hasCounts && existingItems + newItems === 0;
  const { dot, title } = STATE_CONFIG[state];
  const dismiss = () => toast.dismiss(toastId);
  const linkClassName = cn(buttonVariants({ size: "xs", variant: "outline" }), "flex-1");

  return (
    <div className="bg-popover text-popover-foreground border-border flex w-[356px] flex-col gap-2 rounded-md border p-4 shadow-lg">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-2 rounded-full", dot)} />
        <p className="text-sm font-medium">
          {nothingToDo && state !== "queued" ? "Already Synced" : title}
        </p>
      </div>

      <div className="text-muted-foreground space-y-1 text-xs">
        {(() => {
          if (!hasCounts) {
            return (
              <>
                {message && <p className="text-foreground">{message}</p>}
                {description && <p>{description}</p>}
              </>
            );
          }
          if (state === "queued") {
            return (
              <>
                <DetailRow label="Processing" value={`${newItems} items`} />
                {existingItems > 0 && (
                  <DetailRow label="Already synced" value={`${existingItems} items`} />
                )}
              </>
            );
          }
          if (nothingToDo) return <p>All items are already in your collection.</p>;
          return <DetailRow label="Items synced" value={existingItems + newItems} />;
        })()}
      </div>

      <div className="mt-1 flex gap-2">
        {sessionId !== undefined ? (
          <Link
            to="/sync/$id"
            params={{ id: sessionId }}
            onClick={dismiss}
            className={linkClassName}
          >
            View Status
          </Link>
        ) : (
          <Link to="/sync" onClick={dismiss} className={linkClassName}>
            View History
          </Link>
        )}
        <Button size="xs" onClick={dismiss} className="flex-1">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function showSyncToast(data: SyncToastData): void {
  toast.custom((id) => <SyncToastContent toastId={id} {...data} />);
}
