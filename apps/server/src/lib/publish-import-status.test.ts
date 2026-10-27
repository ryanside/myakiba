import { expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";

initLogger({ enabled: false });
let writes = 0;
const transaction = {
  set: () => transaction,
  publish: () => transaction,
  exec: async () => {
    writes += 1;
    return [[null, "OK"]];
  },
};
await mock.module("@myakiba/redis/client", () => ({
  redis: { status: "ready", multi: () => transaction },
}));
const { publishImportStatus } = await import("./publish-import-status");
const status: SyncJobStatus = {
  jobId: "import-job",
  phase: "completed",
  statusMessage: "Import completed.",
  progress: null,
  recentItems: [],
  error: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  terminalState: "success",
};

test("a slow load cannot write after publication has already answered its deadline", async () => {
  const loaded = Promise.withResolvers<SyncJobStatus>();
  let answered = false;
  const publication = publishImportStatus({
    load: () => loaded.promise,
    action: "dataTransfer.publishStatus",
  }).then(() => {
    answered = true;
  });
  try {
    await Bun.sleep(1100);
    expect(writes).toBe(0);
    expect(answered).toBe(false);
  } finally {
    loaded.resolve(status);
    await publication;
  }
  expect(writes).toBe(1);
  await Bun.sleep(20);
  expect(writes).toBe(1);
});
