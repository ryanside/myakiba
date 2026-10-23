import { cleanupWorker, closeSyncSessionCleanupWorker } from "./sync/cleanup";

export const workerConsumers = [cleanupWorker];

export async function closeAllWorkers(): Promise<void> {
  await closeSyncSessionCleanupWorker();
}
