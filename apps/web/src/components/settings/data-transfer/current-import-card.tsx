import { Delete02Icon, Loading03Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DataTransferImport } from "@myakiba/contracts/data-transfer/schema";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { ThemedBadge } from "@/components/reui/badge";
import type { BadgeVariant } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Progress, ProgressLabel } from "@/components/ui/progress";

const numberFormatter = new Intl.NumberFormat();

export type ActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "error"; readonly message: string };

export type CurrentImportLiveState =
  | { readonly kind: "connecting" }
  | { readonly kind: "ready"; readonly status: SyncJobStatus }
  | {
      readonly kind: "disconnected";
      readonly lastStatus: SyncJobStatus | null;
    };

export type CurrentImportViewState =
  | { readonly kind: "none" }
  | {
      readonly kind: "active";
      readonly currentImport: DataTransferImport;
      readonly live: CurrentImportLiveState;
    }
  | { readonly kind: "completed"; readonly currentImport: DataTransferImport }
  | {
      readonly kind: "retryable";
      readonly currentImport: DataTransferImport;
      readonly retry: ActionState;
    };

const STATUS_APPEARANCE = {
  queued: { label: "Queued", variant: "info" },
  running: { label: "Importing", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  partial: { label: "Partially imported", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
} satisfies Record<
  DataTransferImport["status"],
  { readonly label: string; readonly variant: BadgeVariant }
>;

export function CurrentImportCard({
  current,
  deleteState,
  deleteDisabled,
  onReconnect,
  onRetry,
  onDelete,
}: {
  readonly current: Exclude<CurrentImportViewState, { readonly kind: "none" }>;
  readonly deleteState: ActionState;
  readonly deleteDisabled: boolean;
  readonly onReconnect: () => void;
  readonly onRetry: () => void;
  readonly onDelete: () => Promise<void>;
}) {
  const { currentImport } = current;
  const live = current.kind === "active" ? current.live : null;
  let liveStatus: SyncJobStatus | null = null;
  if (live?.kind === "ready") liveStatus = live.status;
  else if (live?.kind === "disconnected") liveStatus = live.lastStatus;

  let displayedStatus: DataTransferImport["status"] = currentImport.status;
  if (liveStatus?.terminalState === "success") displayedStatus = "completed";
  else if (liveStatus?.terminalState === "partial") displayedStatus = "partial";
  else if (liveStatus?.terminalState === "error" || liveStatus?.terminalState === "timeout") {
    displayedStatus = "failed";
  } else if (liveStatus && liveStatus.phase !== "queued") {
    displayedStatus = "running";
  }

  const appearance = STATUS_APPEARANCE[displayedStatus];
  const liveProgress = liveStatus?.progress;
  const progress = liveProgress
    ? Math.round((liveProgress.processed / Math.max(liveProgress.total, 1)) * 100)
    : 0;
  const releaseWarnings =
    (currentImport.report?.releaseSubstitutions ?? 0) +
    (currentImport.report?.missingReleases ?? 0);
  const failureReasons = currentImport.report?.failureReasons ?? [];
  const retryError =
    current.kind === "retryable" && current.retry.kind === "error"
      ? current.retry.message
      : currentImport.error;
  const retryLabel = currentImport.status === "partial" ? "Retry failed items" : "Try import again";
  const retryPendingLabel =
    currentImport.status === "partial" ? "Retrying failed items…" : "Trying import again…";
  const deleteError = deleteState.kind === "error" ? deleteState.message : null;

  return (
    <div className="space-y-4 rounded-lg bg-muted/45 p-3 ring-1 ring-foreground/8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 break-words font-medium">{currentImport.fileName}</p>
        <ThemedBadge variant={appearance.variant}>{appearance.label}</ThemedBadge>
      </div>

      {current.kind === "active" ? (
        <div className="space-y-2">
          {liveProgress ? (
            <Progress value={progress}>
              <ProgressLabel>Items processed</ProgressLabel>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {numberFormatter.format(liveProgress.processed)} of{" "}
                {numberFormatter.format(liveProgress.total)}
              </span>
            </Progress>
          ) : null}
          <p className="shimmer text-pretty text-sm text-muted-foreground" aria-live="polite">
            {liveStatus?.statusMessage ?? "Waiting for live import status…"}
          </p>
        </div>
      ) : null}

      {current.kind !== "active" ? (
        <dl
          className={`grid gap-x-4 gap-y-3 ${
            currentImport.failedCollectionItems > 0 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
          }`}
        >
          <div>
            <dt className="text-xs text-muted-foreground">Orders imported</dt>
            <dd className="font-medium tabular-nums">
              {numberFormatter.format(currentImport.importedOrders)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Items imported</dt>
            <dd className="font-medium tabular-nums">
              {numberFormatter.format(currentImport.importedCollectionItems)}
            </dd>
          </div>
          {currentImport.failedCollectionItems > 0 ? (
            <div>
              <dt className="text-xs text-muted-foreground">Items failed</dt>
              <dd className="font-medium tabular-nums">
                {numberFormatter.format(currentImport.failedCollectionItems)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {current.kind !== "active" && failureReasons.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">Why items failed</p>
          <ul className="space-y-1 text-pretty text-sm text-muted-foreground">
            {failureReasons.map(({ reason, count }) => (
              <li key={reason}>
                {reason}{" "}
                <span className="tabular-nums">
                  {numberFormatter.format(count)} {count === 1 ? "item was" : "items were"}{" "}
                  affected.
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {releaseWarnings > 0 ? (
        <p className="text-pretty text-sm text-muted-foreground">
          {numberFormatter.format(releaseWarnings)} release selection
          {releaseWarnings === 1 ? " was" : "s were"} adjusted due to item release changes.
        </p>
      ) : null}

      {live?.kind === "disconnected" ? (
        <div className="space-y-3 border-t border-foreground/8 pt-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Live import status unavailable</p>
            <p className="text-pretty text-sm text-muted-foreground">
              The import was not cancelled. Reconnect to resume live progress.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onReconnect}>
            <HugeiconsIcon icon={Refresh01Icon} aria-hidden="true" />
            Reconnect
          </Button>
        </div>
      ) : null}

      {current.kind === "retryable" ? (
        <div className="space-y-2 border-t border-foreground/8 pt-3">
          {retryError ? (
            <p className="break-words text-pretty text-sm text-destructive" role="alert">
              {retryError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={current.retry.kind === "pending" || deleteState.kind === "pending"}
              onClick={onRetry}
            >
              <HugeiconsIcon
                icon={current.retry.kind === "pending" ? Loading03Icon : Refresh01Icon}
                className={
                  current.retry.kind === "pending"
                    ? "animate-spin motion-reduce:animate-none"
                    : undefined
                }
                aria-hidden="true"
              />
              {current.retry.kind === "pending" ? retryPendingLabel : retryLabel}
            </Button>
            <DeleteImportSessionDialog
              fileName={currentImport.fileName}
              deleteState={deleteState}
              disabled={deleteDisabled || current.retry.kind === "pending"}
              onDelete={onDelete}
            />
          </div>
        </div>
      ) : null}

      {current.kind === "completed" ? (
        <div className="space-y-2 border-t border-foreground/8 pt-3">
          <DeleteImportSessionDialog
            fileName={currentImport.fileName}
            deleteState={deleteState}
            disabled={deleteDisabled}
            onDelete={onDelete}
          />
        </div>
      ) : null}

      {current.kind !== "active" && deleteError ? (
        <p className="break-words text-pretty text-sm text-destructive" role="alert">
          {deleteError}
        </p>
      ) : null}
    </div>
  );
}

function DeleteImportSessionDialog({
  fileName,
  deleteState,
  disabled,
  onDelete,
}: {
  readonly fileName: string;
  readonly deleteState: ActionState;
  readonly disabled: boolean;
  readonly onDelete: () => Promise<void>;
}) {
  const pending = deleteState.kind === "pending";

  return (
    <ConfirmDialog
      icon={Delete02Icon}
      title="Delete this import session?"
      description={
        <span>
          This removes the saved archive, status, and report for{" "}
          <span className="font-medium text-foreground">{fileName}</span>. Imported orders and
          collection items stay in your account.
        </span>
      }
      confirmLabel="Delete session"
      loadingLabel="Deleting session…"
      disabled={disabled || pending}
      renderTrigger={
        <Button type="button" size="sm" variant="outline" disabled={disabled || pending}>
          <HugeiconsIcon
            icon={pending ? Loading03Icon : Delete02Icon}
            className={pending ? "animate-spin motion-reduce:animate-none" : undefined}
            aria-hidden="true"
          />
          {pending ? "Deleting session…" : "Delete session"}
        </Button>
      }
      onConfirm={onDelete}
    />
  );
}
