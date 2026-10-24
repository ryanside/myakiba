import type { Result } from "better-result";
import type {
  DataTransferArchiveV1,
  DataTransferImportRequest,
} from "@myakiba/contracts/data-transfer/schema";
import { call } from "@/data/api";
import type { ApiFailure } from "@/data/api";
import { app } from "@/lib/treaty-client";

export function exportDataTransfer(): Promise<Result<DataTransferArchiveV1, ApiFailure>> {
  return call(app.api["data-transfer"].export.get(), {
    fallback: "Failed to export your data",
  });
}

export function getCurrentDataTransferImport() {
  return call(app.api["data-transfer"].imports.current.get(), {
    fallback: "Failed to check import status",
  });
}

export function startDataTransferImport(request: DataTransferImportRequest) {
  return call(app.api["data-transfer"].imports.post(request), {
    fallback: "Failed to start import",
  });
}

export function retryCurrentDataTransferImport() {
  return call(app.api["data-transfer"].imports.current.retry.post(), {
    fallback: "Failed to retry import",
  });
}

export function deleteCurrentDataTransferImport() {
  return call(app.api["data-transfer"].imports.current.delete(), {
    fallback: "Failed to delete the import session",
  });
}
