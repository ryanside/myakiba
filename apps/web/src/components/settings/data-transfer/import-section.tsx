import { FileImportIcon, Loading03Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DATA_TRANSFER_MAX_BYTES } from "@myakiba/contracts/data-transfer/schema";
import { Dropzone } from "@/components/kibo-ui/dropzone";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsRow } from "@/components/settings/settings-row";
import { CurrentImportCard } from "./current-import-card";
import type { ActionState, CurrentImportViewState } from "./current-import-card";

const numberFormatter = new Intl.NumberFormat();

export type PreparedFileViewState =
  | { readonly kind: "idle" }
  | { readonly kind: "reading"; readonly file: File }
  | {
      readonly kind: "ready";
      readonly file: File;
      readonly preview: {
        readonly orders: number;
        readonly collectionItems: number;
      };
    }
  | { readonly kind: "invalid"; readonly file: File | null; readonly message: string };

type CurrentImportLoadState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly current: CurrentImportViewState | null;
      readonly retrying: boolean;
    }
  | { readonly kind: "ready"; readonly current: CurrentImportViewState };

export type ImportViewState = {
  readonly current: CurrentImportLoadState;
  readonly delete: ActionState;
  readonly prepared: PreparedFileViewState;
  readonly start: ActionState;
};

export type ImportViewActions = {
  readonly handleReconnectImportStatus: () => void;
  readonly handleRetryCurrentImportLoad: () => void;
  readonly onFile: (file: File) => void;
  readonly handleFileError: (error: Error) => void;
  readonly handleConfirmImport: () => Promise<void>;
  readonly handleRetryCurrentImport: () => void;
  readonly handleDeleteCurrentImport: () => Promise<void>;
};

export function ImportSection({
  state,
  actions,
  confirmationOpen,
  onConfirmationOpenChange,
}: {
  readonly state: ImportViewState;
  readonly actions: ImportViewActions;
  readonly confirmationOpen?: boolean;
  readonly onConfirmationOpenChange?: (open: boolean) => void;
}) {
  const currentImport = state.current.kind === "loading" ? null : state.current.current;
  const activeImport = currentImport?.kind === "active";
  const retryPending =
    currentImport?.kind === "retryable" && currentImport.retry.kind === "pending";
  const deletePending = state.delete.kind === "pending";
  const selectedFiles =
    state.prepared.kind === "idle" || state.prepared.file === null
      ? undefined
      : [state.prepared.file];
  const importControlsDisabled = state.start.kind === "pending" || retryPending || deletePending;

  const showPreparedDetails =
    state.current.kind === "ready" &&
    !activeImport &&
    (state.prepared.kind === "reading" ||
      state.prepared.kind === "invalid" ||
      state.prepared.kind === "ready" ||
      state.start.kind === "error");

  return (
    <div className="flex flex-col">
      <SettingsRow
        title="Import"
        description="Import a myakiba JSON export. The export data will be added to your account."
      >
        {state.current.kind === "loading" ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground" aria-live="polite">
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Checking current import…
          </p>
        ) : null}

        {state.current.kind === "error" ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="text-pretty text-sm text-destructive" role="alert">
              {state.current.message}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={state.current.retrying}
              onClick={actions.handleRetryCurrentImportLoad}
            >
              <HugeiconsIcon
                icon={state.current.retrying ? Loading03Icon : Refresh01Icon}
                className={
                  state.current.retrying ? "animate-spin motion-reduce:animate-none" : undefined
                }
                aria-hidden="true"
              />
              {state.current.retrying ? "Retrying…" : "Retry"}
            </Button>
          </div>
        ) : null}

        {state.current.kind === "ready" && !activeImport ? (
          <Dropzone
            accept={{ "application/json": [".json"] }}
            maxFiles={1}
            maxSize={DATA_TRANSFER_MAX_BYTES}
            src={selectedFiles}
            disabled={importControlsDisabled}
            className="h-7 w-full flex-row gap-1 rounded-[min(var(--radius-md),12px)] p-0 px-2.5 text-[0.8rem] sm:w-fit"
            onDrop={(files) => {
              const file = files[0];
              if (file) actions.onFile(file);
            }}
            onError={actions.handleFileError}
          >
            <HugeiconsIcon icon={FileImportIcon} aria-hidden="true" />
            Choose export
          </Dropzone>
        ) : null}
      </SettingsRow>

      {showPreparedDetails ? (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {state.prepared.kind === "reading" ? (
            <p className="flex items-center gap-1 text-sm text-muted-foreground" aria-live="polite">
              <HugeiconsIcon
                icon={Loading03Icon}
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Checking the export…
            </p>
          ) : null}

          {state.prepared.kind === "invalid" ? (
            <p className="text-pretty text-sm text-destructive" role="alert">
              {state.prepared.message}
            </p>
          ) : null}

          {state.prepared.kind === "ready" ? (
            <div className="flex flex-col gap-4 rounded-lg bg-muted/45 p-3 ring-1 ring-foreground/8">
              <p className="wrap-break-word font-medium">{state.prepared.file.name}</p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Orders</dt>
                  <dd className="font-medium tabular-nums">
                    {numberFormatter.format(state.prepared.preview.orders)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Items</dt>
                  <dd className="font-medium tabular-nums">
                    {numberFormatter.format(state.prepared.preview.collectionItems)}
                  </dd>
                </div>
              </dl>

              <ConfirmDialog
                open={confirmationOpen}
                onOpenChange={onConfirmationOpenChange}
                variant="default"
                icon={FileImportIcon}
                title="Import this export?"
                description={
                  <span className="flex flex-col gap-2">
                    <span className="block">
                      This adds {numberFormatter.format(state.prepared.preview.orders)} orders and{" "}
                      {numberFormatter.format(state.prepared.preview.collectionItems)} items.
                      Existing records are not changed.
                    </span>
                    {currentImport && currentImport.kind !== "none" ? (
                      <span className="block">
                        Starting this import replaces the saved import session for{" "}
                        <span className="font-medium text-foreground">
                          {currentImport.currentImport.fileName}
                        </span>
                        . Records added by that import stay in your account.
                      </span>
                    ) : null}
                  </span>
                }
                confirmLabel="Import data"
                loadingLabel="Starting import…"
                disabled={importControlsDisabled}
                renderTrigger={
                  <Button type="button" className="w-full" disabled={importControlsDisabled}>
                    <HugeiconsIcon
                      icon={state.start.kind === "pending" ? Loading03Icon : FileImportIcon}
                      className={
                        state.start.kind === "pending"
                          ? "animate-spin motion-reduce:animate-none"
                          : undefined
                      }
                      aria-hidden="true"
                    />
                    {state.start.kind === "pending" ? "Starting import…" : "Import data"}
                  </Button>
                }
                onConfirm={actions.handleConfirmImport}
              />
            </div>
          ) : null}

          {state.start.kind === "error" ? (
            <p className="text-pretty text-sm text-destructive" role="alert">
              {state.start.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {currentImport && currentImport.kind !== "none" ? (
        <div className="px-4 pb-4">
          <CurrentImportCard
            current={currentImport}
            deleteState={state.delete}
            deleteDisabled={state.start.kind === "pending" || retryPending}
            onReconnect={actions.handleReconnectImportStatus}
            onRetry={actions.handleRetryCurrentImport}
            onDelete={actions.handleDeleteCurrentImport}
          />
        </div>
      ) : null}
    </div>
  );
}
