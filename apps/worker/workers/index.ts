import { syncWorker } from "./sync/worker";
import { itemResyncWorker } from "./item-resync/worker";
import { dataTransferImportWorker } from "./data-transfer/worker";

export async function closeAllWorkers(): Promise<void> {
  await Promise.all([
    syncWorker.close(),
    itemResyncWorker.close(),
    dataTransferImportWorker.close(),
  ]);
}
