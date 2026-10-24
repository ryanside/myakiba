import {
  DATA_TRANSFER_MAX_BYTES,
  dataTransferArchiveV1Schema,
} from "@myakiba/contracts/data-transfer/schema";
import type { DataTransferArchiveV1 } from "@myakiba/contracts/data-transfer/schema";
import { parseJson } from "@myakiba/utils/parse-json";

function parseDataTransferJson(rawJson: string): DataTransferArchiveV1 {
  const parsed = parseJson(dataTransferArchiveV1Schema, rawJson);
  if (parsed.isOk()) return parsed.value;

  throw new Error(
    parsed.error.match({
      InvalidJson: () => "This file is not valid JSON.",
      JsonSchemaMismatch: ({ issues }) =>
        issues[0]?.message ?? "This is not a supported myakiba export.",
    }),
  );
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
