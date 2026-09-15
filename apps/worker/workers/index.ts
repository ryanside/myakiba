import { closeSyncWorker, syncWorker } from "./sync/worker";
import { cleanupWorker, closeSyncSessionCleanupWorker } from "./sync/cleanup";
import { itemResyncWorker } from "./item-resync/worker";
import {
  metadataBackfillWorker,
  closeMetadataBackfillWorker,
} from "./item-resync/metadata-backfill";
import { dataTransferImportWorker } from "./data-transfer/worker";

export const workerConsumers = [
  syncWorker,
  cleanupWorker,
  metadataBackfillWorker,
  itemResyncWorker,
  dataTransferImportWorker,
];

export async function closeAllWorkers(): Promise<void> {
  await Promise.all([
    closeSyncWorker(),
    closeSyncSessionCleanupWorker(),
    closeMetadataBackfillWorker(),
    itemResyncWorker.close(),
    dataTransferImportWorker.close(),
  ]);
}
