import { closeSyncWorker } from "./sync/worker";
import { closeSyncSessionCleanupWorker } from "./sync/cleanup";
import { itemResyncWorker } from "./item-resync/worker";
import { dataTransferImportWorker } from "./data-transfer/worker";

export async function closeAllWorkers(): Promise<void> {
  await Promise.all([
    closeSyncWorker(),
    closeSyncSessionCleanupWorker(),
    itemResyncWorker.close(),
    dataTransferImportWorker.close(),
  ]);
}
