import type {
  DataTransferArchiveV1,
  DataTransferImportRequest,
} from "@myakiba/contracts/data-transfer/schema";
import { call, rejectErr } from "@/data/api";
import { app } from "@/lib/treaty-client";

export async function exportDataTransfer(): Promise<DataTransferArchiveV1> {
  return call(app.api["data-transfer"].export.get(), {
    fallback: "Failed to export your data",
    policy: "legacy",
  }).then(rejectErr);
}

export async function getCurrentDataTransferImport() {
  return call(app.api["data-transfer"].imports.current.get(), {
    fallback: "Failed to check import status",
    policy: "legacy",
  }).then(rejectErr);
}

export async function startDataTransferImport(request: DataTransferImportRequest) {
  return call(app.api["data-transfer"].imports.post(request), {
    fallback: "Failed to start import",
    policy: "legacy",
  }).then(rejectErr);
}

export async function retryCurrentDataTransferImport() {
  return call(app.api["data-transfer"].imports.current.retry.post(), {
    fallback: "Failed to retry import",
    policy: "legacy",
  }).then(rejectErr);
}

export async function deleteCurrentDataTransferImport() {
  return call(app.api["data-transfer"].imports.current.delete(), {
    fallback: "Failed to delete the import session",
    policy: "legacy",
  }).then(rejectErr);
}
