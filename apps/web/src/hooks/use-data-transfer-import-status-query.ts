import type { DataTransferImport } from "@myakiba/contracts/data-transfer/schema";
import { useRead } from "@/data/client";
import { dataTransfer } from "@/data/resources/data-transfer";

export function useDataTransferImportStatusQuery(currentImport: DataTransferImport | null) {
  const activeImport =
    currentImport?.status === "queued" || currentImport?.status === "running"
      ? currentImport
      : null;

  return useRead(dataTransfer.importStatus, activeImport?.id ?? null, {
    enabled: activeImport !== null,
  });
}
