import { Download01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import type { DataTransferArchiveV1 } from "@myakiba/contracts/data-transfer/schema";
import { Button } from "@/components/ui/button";
import { useDataTransferImportStatusQuery } from "@/hooks/use-data-transfer-import-status-query";
import { downloadDataTransferArchive, readDataTransferFile } from "@/lib/data-transfer";
import { failureText, useRead } from "@/data/client";
import {
  dataTransfer,
  useDeleteImport,
  useExportData,
  useRetryImport,
  useStartImport,
} from "@/data/resources/data-transfer";
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
  const [preparedFile, setPreparedFile] = useState<PreparedFile>({ kind: "idle" });
  const readVersion = useRef(0);

  const currentImportQuery = useRead(dataTransfer.currentImport);
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

  const exportMutation = useExportData(downloadDataTransferArchive);

  const startMutation = useStartImport(() => {
    setPreparedFile({ kind: "idle" });
  });
  const { reset: resetStartMutation } = startMutation;

  const retryMutation = useRetryImport(() => {
    setPreparedFile({ kind: "idle" });
    resetStartMutation();
  });
  const { reset: resetRetryMutation } = retryMutation;

  const deleteMutation = useDeleteImport(() => {
    resetRetryMutation();
  });

  const handleFile = async (file: File): Promise<void> => {
    const version = readVersion.current + 1;
    readVersion.current = version;
    setPreparedFile({ kind: "reading", file });
    resetStartMutation();
    resetRetryMutation();

    const archive = await readDataTransferFile(file);
    if (readVersion.current !== version) return;
    setPreparedFile(
      archive.isOk()
        ? { kind: "ready", file, archive: archive.value }
        : { kind: "invalid", file, message: archive.error.message },
    );
  };

  let exportState: ActionState = { kind: "idle" };
  if (exportMutation.isPending) exportState = { kind: "pending" };
  else if (exportMutation.error) {
    exportState = { kind: "error", message: failureText(exportMutation.error) };
  }

  let startState: ActionState = { kind: "idle" };
  if (startMutation.isPending) startState = { kind: "pending" };
  else if (startMutation.error) {
    startState = { kind: "error", message: failureText(startMutation.error) };
  }

  let retryState: ActionState = { kind: "idle" };
  if (retryMutation.isPending) retryState = { kind: "pending" };
  else if (retryMutation.error) {
    retryState = { kind: "error", message: failureText(retryMutation.error) };
  }

  let deleteState: ActionState = { kind: "idle" };
  if (deleteMutation.isPending) deleteState = { kind: "pending" };
  else if (deleteMutation.error) {
    deleteState = { kind: "error", message: failureText(deleteMutation.error) };
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
      message: failureText(currentImportQuery.error),
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
        handleExport: () => {
          void exportMutation.run();
        },
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

          // A failed start shows its error beside the import controls, so the dialog closes either way.
          await startMutation.run({
            fileName: preparedFile.file.name,
            archive: preparedFile.archive,
          });
        },
        handleRetryCurrentImport: () => {
          void retryMutation.run();
        },
        handleDeleteCurrentImport: async () => {
          // A failed delete shows its error beside the import controls, so the dialog closes either way.
          await deleteMutation.run();
        },
      }}
    />
  );
}

export function DataTransferView({
  state,
  actions,
}: {
  readonly state: DataTransferViewState;
  readonly actions: DataTransferViewActions;
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
            data-icon="inline-start"
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

      <ImportSection state={state.import} actions={actions} />
    </SettingsGroup>
  );
}
