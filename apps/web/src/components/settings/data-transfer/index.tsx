import { Download01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { DataTransferArchiveV1 } from "@myakiba/contracts/data-transfer/schema";
import { Button } from "@/components/ui/button";
import {
  dataTransferCurrentImportQueryKey,
  dataTransferImportStatusQueryKey,
  useDataTransferImportStatusQuery,
} from "@/hooks/use-data-transfer-import-status-query";
import { downloadDataTransferArchive, readDataTransferFile } from "@/lib/data-transfer";
import {
  deleteCurrentDataTransferImport,
  exportDataTransfer,
  getCurrentDataTransferImport,
  retryCurrentDataTransferImport,
  startDataTransferImport,
} from "@/queries/data-transfer";
import type {
  ActionState,
  CurrentImportLiveState,
  CurrentImportViewState,
} from "./current-import-card";
import { SettingsGroup } from "../settings-group";
import { SettingsRow } from "../settings-row";
import { ImportSection } from "./import-section";
import type { ImportViewActions, ImportViewState, PreparedFileViewState } from "./import-section";

type PreparedFile =
  | { readonly kind: "idle" }
  | { readonly kind: "reading"; readonly file: File }
  | {
      readonly kind: "ready";
      readonly file: File;
      readonly archive: DataTransferArchiveV1;
    }
  | { readonly kind: "invalid"; readonly file: File | null; readonly message: string };

export type DataTransferViewState = {
  readonly export: ActionState;
  readonly import: ImportViewState;
};

export type DataTransferViewActions = ImportViewActions & {
  readonly handleExport: () => void;
};

export function DataTransfer() {
  const queryClient = useQueryClient();
  const [preparedFile, setPreparedFile] = useState<PreparedFile>({ kind: "idle" });
  const readVersion = useRef(0);

  const currentImportQuery = useQuery({
    queryKey: dataTransferCurrentImportQueryKey,
    queryFn: getCurrentDataTransferImport,
    retry: false,
  });
  const currentImport = currentImportQuery.data ?? null;
  const liveStatusQuery = useDataTransferImportStatusQuery(currentImport);

  const prepared: PreparedFileViewState =
    preparedFile.kind === "ready"
      ? {
          kind: "ready",
          file: preparedFile.file,
          preview: {
            orders: preparedFile.archive.orders.length,
            collectionItems: preparedFile.archive.collectionItems.length,
          },
        }
      : preparedFile;

  const exportMutation = useMutation({
    mutationFn: exportDataTransfer,
    onSuccess: (archive) => {
      downloadDataTransferArchive(archive);
      exportMutation.reset();
    },
  });

  const startMutation = useMutation({
    mutationFn: startDataTransferImport,
    onSuccess: (startedImport) => {
      setPreparedFile({ kind: "idle" });
      queryClient.setQueryData(dataTransferCurrentImportQueryKey, startedImport);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataTransferCurrentImportQueryKey }),
  });
  const { reset: resetStartMutation } = startMutation;

  const retryMutation = useMutation({
    mutationFn: retryCurrentDataTransferImport,
    onSuccess: (retriedImport) => {
      queryClient.removeQueries({
        queryKey: dataTransferImportStatusQueryKey(retriedImport.id),
        exact: true,
      });
      queryClient.setQueryData(dataTransferCurrentImportQueryKey, retriedImport);
      setPreparedFile({ kind: "idle" });
      resetStartMutation();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataTransferCurrentImportQueryKey }),
  });
  const { reset: resetRetryMutation } = retryMutation;

  const deleteMutation = useMutation({
    mutationFn: deleteCurrentDataTransferImport,
    onSuccess: (deletedImport) => {
      queryClient.removeQueries({
        queryKey: dataTransferImportStatusQueryKey(deletedImport.id),
        exact: true,
      });
      queryClient.setQueryData(dataTransferCurrentImportQueryKey, null);
      resetRetryMutation();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataTransferCurrentImportQueryKey }),
  });

  const handleFile = async (file: File): Promise<void> => {
    const version = readVersion.current + 1;
    readVersion.current = version;
    setPreparedFile({ kind: "reading", file });
    resetStartMutation();
    resetRetryMutation();

    try {
      const archive = await readDataTransferFile(file);
      if (readVersion.current !== version) return;
      setPreparedFile({
        kind: "ready",
        file,
        archive,
      });
    } catch (error) {
      if (readVersion.current !== version) return;
      setPreparedFile({
        kind: "invalid",
        file,
        message: error instanceof Error ? error.message : "This export could not be read.",
      });
    }
  };

  let exportState: ActionState = { kind: "idle" };
  if (exportMutation.isPending) exportState = { kind: "pending" };
  else if (exportMutation.isError) {
    exportState = { kind: "error", message: exportMutation.error.message };
  }

  let startState: ActionState = { kind: "idle" };
  if (startMutation.isPending) startState = { kind: "pending" };
  else if (startMutation.isError) {
    startState = { kind: "error", message: startMutation.error.message };
  }

  let retryState: ActionState = { kind: "idle" };
  if (retryMutation.isPending) retryState = { kind: "pending" };
  else if (retryMutation.isError) {
    retryState = { kind: "error", message: retryMutation.error.message };
  }

  let deleteState: ActionState = { kind: "idle" };
  if (deleteMutation.isPending) deleteState = { kind: "pending" };
  else if (deleteMutation.isError) {
    deleteState = { kind: "error", message: deleteMutation.error.message };
  }

  let currentView: CurrentImportViewState = { kind: "none" };
  if (currentImport?.status === "queued" || currentImport?.status === "running") {
    let live: CurrentImportLiveState;
    if (liveStatusQuery.isError) {
      live = { kind: "disconnected", lastStatus: liveStatusQuery.data ?? null };
    } else if (liveStatusQuery.data) {
      live = { kind: "ready", status: liveStatusQuery.data };
    } else {
      live = { kind: "connecting" };
    }
    currentView = { kind: "active", currentImport, live };
  } else if (currentImport?.status === "completed") {
    currentView = { kind: "completed", currentImport };
  } else if (currentImport) {
    currentView = { kind: "retryable", currentImport, retry: retryState };
  }

  let currentState: ImportViewState["current"];
  if (currentImportQuery.isPending) currentState = { kind: "loading" };
  else if (currentImportQuery.isError) {
    currentState = {
      kind: "error",
      message: currentImportQuery.error.message,
      current: currentImport === null ? null : currentView,
      retrying: currentImportQuery.isFetching,
    };
  } else {
    currentState = { kind: "ready", current: currentView };
  }

  const state: DataTransferViewState = {
    export: exportState,
    import: {
      current: currentState,
      delete: deleteState,
      prepared,
      start: startState,
    },
  };

  return (
    <DataTransferView
      state={state}
      actions={{
        handleExport: () => exportMutation.mutate(),
        handleReconnectImportStatus: () => liveStatusQuery.refetch(),
        handleRetryCurrentImportLoad: () => currentImportQuery.refetch(),
        onFile: (file) => handleFile(file),
        handleFileError: (error) => {
          readVersion.current += 1;
          resetStartMutation();
          resetRetryMutation();
          setPreparedFile({ kind: "invalid", file: null, message: error.message });
        },
        handleConfirmImport: async () => {
          if (preparedFile.kind !== "ready") return;

          try {
            await startMutation.mutateAsync({
              fileName: preparedFile.file.name,
              archive: preparedFile.archive,
            });
          } catch {
            // The mutation keeps the actionable error beside the import controls.
          }
        },
        handleRetryCurrentImport: () => retryMutation.mutate(),
        handleDeleteCurrentImport: async () => {
          try {
            await deleteMutation.mutateAsync();
          } catch {
            // The mutation keeps the actionable error beside the import controls.
          }
        },
      }}
    />
  );
}

export function DataTransferView({
  state,
  actions,
  confirmationOpen,
  onConfirmationOpenChange,
}: {
  readonly state: DataTransferViewState;
  readonly actions: DataTransferViewActions;
  readonly confirmationOpen?: boolean;
  readonly onConfirmationOpenChange?: (open: boolean) => void;
}) {
  return (
    <SettingsGroup>
      <SettingsRow
        title="Export"
        description="Download your orders and collection records as a JSON file."
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={state.export.kind === "pending"}
          onClick={actions.handleExport}
        >
          <HugeiconsIcon
            icon={state.export.kind === "pending" ? Loading03Icon : Download01Icon}
            className={
              state.export.kind === "pending"
                ? "animate-spin motion-reduce:animate-none"
                : undefined
            }
            aria-hidden="true"
          />
          {state.export.kind === "pending" ? "Preparing…" : "Download export"}
        </Button>
        {state.export.kind === "error" ? (
          <p className="text-pretty text-sm text-destructive" role="alert">
            {state.export.message}
          </p>
        ) : null}
      </SettingsRow>

      <ImportSection
        state={state.import}
        actions={actions}
        confirmationOpen={confirmationOpen}
        onConfirmationOpenChange={onConfirmationOpenChange}
      />
    </SettingsGroup>
  );
}
