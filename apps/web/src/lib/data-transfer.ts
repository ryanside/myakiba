import {
  DATA_TRANSFER_MAX_BYTES,
  dataTransferArchiveV1Schema,
} from "@myakiba/contracts/data-transfer/schema";
import type { DataTransferArchiveV1 } from "@myakiba/contracts/data-transfer/schema";

export function parseDataTransferJson(rawJson: string): DataTransferArchiveV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("This file is not valid JSON.");
  }

  const result = dataTransferArchiveV1Schema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(firstIssue?.message ?? "This is not a supported myakiba export.");
  }

  return result.data;
}

export async function readDataTransferFile(file: File): Promise<DataTransferArchiveV1> {
  if (file.size > DATA_TRANSFER_MAX_BYTES) {
    throw new Error("The selected export is larger than the 50 MiB import limit.");
  }

  return parseDataTransferJson(await file.text());
}

export function downloadDataTransferArchive(archive: DataTransferArchiveV1): void {
  const contents = `${JSON.stringify(archive, null, 2)}\n`;
  const blob = new Blob([contents], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const exportDate = archive.exportedAt.slice(0, 10);

  link.href = objectUrl;
  link.download = `myakiba-export-${exportDate}.json`;
  link.hidden = true;
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
