import { closeSyncWorker, syncWorker } from "./sync/worker";
import { cleanupWorker, closeSyncSessionCleanupWorker } from "./sync/cleanup";
import { itemResyncWorker } from "./item-resync/worker";
import { dataTransferImportWorker } from "./data-transfer/worker";

export const workerConsumers = [
  syncWorker,
  cleanupWorker,
  itemResyncWorker,
  dataTransferImportWorker,
];

export async function closeAllWorkers(): Promise<void> {
  await Promise.all([
    closeSyncWorker(),
    closeSyncSessionCleanupWorker(),
    itemResyncWorker.close(),
    dataTransferImportWorker.close(),
  ]);
}
