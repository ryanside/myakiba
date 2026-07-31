import type {
  DataTransferArchiveV1,
  DataTransferImportRequest,
} from "@myakiba/contracts/data-transfer/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";

export async function exportDataTransfer(): Promise<DataTransferArchiveV1> {
  const { data, error } = await app.api["data-transfer"].export.get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to export your data"));
  }
  return data;
}

export async function getCurrentDataTransferImport() {
  const { data, error } = await app.api["data-transfer"].imports.current.get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to check import status"));
  }
  return data;
}

export async function startDataTransferImport(request: DataTransferImportRequest) {
  const { data, error } = await app.api["data-transfer"].imports.post(request);
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to start import"));
  }
  return data;
}

export async function retryCurrentDataTransferImport() {
  const { data, error } = await app.api["data-transfer"].imports.current.retry.post();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to retry import"));
  }
  return data;
}

export async function deleteCurrentDataTransferImport() {
  const { data, error } = await app.api["data-transfer"].imports.current.delete();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to delete the import session"));
  }
  return data;
}
