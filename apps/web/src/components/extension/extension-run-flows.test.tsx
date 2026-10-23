import { afterEach, expect, mock, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { DataTransferImport } from "@myakiba/contracts/data-transfer/schema";
import { delegatingBridge, fakeExtension } from "../../../test/fake-extension";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const extension = fakeExtension({ installed: true });
const { createExtensionBridge } = await import("@/lib/extension-bridge");
const bridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const realRun = await import("@/data/extension-run");
const syncRuns: Parameters<typeof realRun.importSyncItems>[0][] = [];
const importRuns: Parameters<typeof realRun.importDataTransferItems>[0][] = [];
await mock.module("@/data/extension-run", () => ({
  ...realRun,
  importSyncItems: (run: (typeof syncRuns)[number]) => syncRuns.push(run),
  importDataTransferItems: (run: (typeof importRuns)[number]) => importRuns.push(run),
}));

const accepted = (newItems: number, missingMfcItemIds: number[]) => ({
  syncSessionId: "ss-1",
  status: "Import queued",
  isFinished: missingMfcItemIds.length === 0,
  existingItemsToInsert: 1 - newItems,
  newItems,
  jobId: missingMfcItemIds.length === 0 ? null : "job-1",
  missingMfcItemIds,
});
let syncAnswer = accepted(1, [98_777]);
let syncsSent = 0;
const realSync = await import("@/queries/sync");
await mock.module("@/queries/sync", () => ({
  ...realSync,
  sendItemSync: async () => {
    syncsSent += 1;
    return syncAnswer;
  },
  sendOrder: async () => syncAnswer,
  retrySyncSession: async () => ({ jobId: "job-2", missingMfcItemIds: [11, 12] }),
}));
const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "fixture" } };
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
}));

const partialImport: DataTransferImport = {
  id: "imp-1",
  fileName: "myakiba-export.json",
  status: "partial",
  importedOrders: 1,
  importedCollectionItems: 1,
  failedCollectionItems: 2,
  report: null,
  error: null,
};
let currentImport: DataTransferImport | null = null;
const realDataTransfer = await import("@/queries/data-transfer");
await mock.module("@/queries/data-transfer", () => ({
  ...realDataTransfer,
  getCurrentDataTransferImport: async () => currentImport,
  startDataTransferImport: async () => ({
    ...partialImport,
    id: "imp-2",
    status: "running",
    missingMfcItemIds: [21, 22],
  }),
  retryCurrentDataTransferImport: async () => ({
    ...partialImport,
    status: "running",
    missingMfcItemIds: [31],
  }),
}));
const realStatus = await import("@/hooks/use-data-transfer-import-status-query");
await mock.module("@/hooks/use-data-transfer-import-status-query", () => ({
  ...realStatus,
  useDataTransferImportStatusQuery: () => ({ isError: false, data: null, refetch: async () => {} }),
}));
const realFile = await import("@/lib/data-transfer");
await mock.module("@/lib/data-transfer", () => ({
  ...realFile,
  readDataTransferFile: async () => ({ orders: [{}], collectionItems: [{}, {}] }),
}));

const { RetrySyncSessionButton } = await import("@/components/sync/retry-sync-session-button");
const { SyncActionSheet } = await import("@/components/sync/sync-launcher");
const { DataTransfer } = await import("@/components/settings/data-transfer");

function renderWithQueries(ui: ReactElement) {
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  syncRuns.length = 0;
  importRuns.length = 0;
  currentImport = null;
  syncAnswer = accepted(1, [98_777]);
  syncsSent = 0;
});

async function submitForm(syncType: "item" | "order", submit: string) {
  const user = userEvent.setup();
  renderWithQueries(<SyncActionSheet syncType={syncType} onSyncTypeChange={() => {}} />);
  await user.type(screen.getByPlaceholderText("MyFigureCollection item link or ID"), "98777");
  await user.click(screen.getByRole("button", { name: submit }));
}

test.each([
  ["item", "Add"],
  ["order", "Create order"],
] as const)(
  "a %s sync fetches the items its response lists as missing",
  async (syncType, submit) => {
    await submitForm(syncType, submit);

    await waitFor(() =>
      expect(syncRuns).toEqual([{ sessionId: "ss-1", jobId: "job-1", mfcItemIds: [98_777] }]),
    );
  },
);

test("a sync with nothing missing starts no fetch", async () => {
  syncAnswer = accepted(0, []);
  await submitForm("item", "Add");

  await waitFor(() => expect(syncsSent).toBe(1));
  await waitFor(() =>
    expect(
      screen.getByPlaceholderText<HTMLInputElement>("MyFigureCollection item link or ID").value,
    ).toBe(""),
  );
  expect(syncRuns).toEqual([]);
});

test("a session retry fetches the items it returned under the retry's job", async () => {
  const user = userEvent.setup();
  renderWithQueries(
    <RetrySyncSessionButton
      sessionId="ss-1"
      retrySupported
      canRetry
      isRetrying={false}
      failCount={2}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Retry failed item results" }));

  await waitFor(() =>
    expect(syncRuns).toEqual([{ sessionId: "ss-1", jobId: "job-2", mfcItemIds: [11, 12] }]),
  );
});

test("an Import/Export import fetches the items it is missing", async () => {
  const user = userEvent.setup();
  renderWithQueries(<DataTransfer />);
  const input = await waitFor(() => {
    const found = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (found === null) throw new Error("no file input yet");
    return found;
  });

  await user.upload(input, new File(["{}"], "myakiba-export.json", { type: "application/json" }));
  await user.click(await screen.findByRole("button", { name: "Import data" }));
  const confirmation = await screen.findByRole("dialog", { name: "Import this export?" });
  await user.click(within(confirmation).getByRole("button", { name: "Import data" }));

  await waitFor(() => expect(importRuns).toEqual([{ importId: "imp-2", mfcItemIds: [21, 22] }]));
});

test("an Import/Export retry fetches the items it is missing", async () => {
  currentImport = partialImport;
  const user = userEvent.setup();
  renderWithQueries(<DataTransfer />);

  await user.click(await screen.findByRole("button", { name: "Retry failed items" }));

  await waitFor(() => expect(importRuns).toEqual([{ importId: "imp-1", mfcItemIds: [31] }]));
});
