import {
  DATA_TRANSFER_MAX_BYTES,
  dataTransferArchiveV1Schema,
} from "@myakiba/contracts/data-transfer/schema";
import type { DataTransferArchiveV1 } from "@myakiba/contracts/data-transfer/schema";
import { parseJson } from "@myakiba/utils/parse-json";
import { Result } from "better-result";
import { ExportFileNotJson } from "@/lib/errors/export-file-not-json";
import { ExportFileTooLarge } from "@/lib/errors/export-file-too-large";
import { ExportFileUnreadable } from "@/lib/errors/export-file-unreadable";
import { ExportFileUnsupported } from "@/lib/errors/export-file-unsupported";

type ExportFileFailure =
  | ExportFileTooLarge
  | ExportFileUnreadable
  | ExportFileNotJson
  | ExportFileUnsupported;

function parseDataTransferJson(
  rawJson: string,
): Result<DataTransferArchiveV1, ExportFileNotJson | ExportFileUnsupported> {
  return parseJson(dataTransferArchiveV1Schema, rawJson).mapError((failure) =>
    failure.match({
      InvalidJson: () => new ExportFileNotJson(),
      JsonSchemaMismatch: ({ cause }) => new ExportFileUnsupported({ cause }),
    }),
  );
}

export async function readDataTransferFile(
  file: File,
): Promise<Result<DataTransferArchiveV1, ExportFileFailure>> {
  if (file.size > DATA_TRANSFER_MAX_BYTES) {
    return Result.err(new ExportFileTooLarge());
  }

  const text = await Result.tryPromise({
    try: () => file.text(),
    catch: (cause) => new ExportFileUnreadable({ cause }),
  });
  return text.andThen(parseDataTransferJson);
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
