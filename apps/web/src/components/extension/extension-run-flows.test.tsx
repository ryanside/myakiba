import { afterEach, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import { cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { RunOutcome } from "@/data/extension-run";
import { delegatingBridge, fakeExtension } from "../../../test/fake-extension";
import { Result } from "better-result";

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
const ENDED: RunOutcome = { kind: "ended" };
let outcome: RunOutcome | Error = ENDED;
const settle = async () => {
  if (outcome instanceof Error) throw outcome;
  return outcome;
};
const syncRuns: Parameters<typeof realRun.importSyncItems>[0][] = [];
await mock.module("@/data/extension-run", () => ({
  ...realRun,
  importSyncItems: async (run: (typeof syncRuns)[number]) => {
    syncRuns.push(run);
    return settle();
  },
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
    return Result.ok(syncAnswer);
  },
  sendOrder: async () => Result.ok(syncAnswer),
  retrySyncSession: async () => Result.ok({ jobId: "job-2", missingMfcItemIds: [11, 12] }),
}));
const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "fixture" } };
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
}));

const { toast } = await import("@/components/ui/toast");
const toastAdd = spyOn(toast, "add");
const { RetrySyncSessionButton } = await import("@/components/sync/retry-sync-session-button");
const { SyncActionSheet } = await import("@/components/sync/sync-launcher");

function renderWithQueries(ui: ReactElement) {
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  syncRuns.length = 0;
  syncAnswer = accepted(1, [98_777]);
  syncsSent = 0;
  outcome = ENDED;
  toastAdd.mockClear();
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

async function retrySession() {
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
}

test("a session retry fetches the items it returned under the retry's job", async () => {
  await retrySession();

  await waitFor(() =>
    expect(syncRuns).toEqual([{ sessionId: "ss-1", jobId: "job-2", mfcItemIds: [11, 12] }]),
  );
});

const FLOWS = [
  ["a sync form", () => submitForm("item", "Add")],
  ["a session retry", retrySession],
] as const;

test.each(FLOWS)("%s says the hourly import limit stopped its run", async (_flow, start) => {
  outcome = { kind: "busy", notImported: 2, retryAfterMs: 120_000 };

  await start();

  await waitFor(() =>
    expect(
      toastAdd.mock.calls.map(([{ title, description }]) => ({ title, description })),
    ).toContainEqual({
      title: "You've reached the hourly import limit",
      description: "2 items were not imported. Try again in 2 min.",
    }),
  );
});

test.each(FLOWS)("%s says its run stopped when the run breaks off", async (_flow, start) => {
  outcome = new TypeError("network error");

  await start();

  await waitFor(() =>
    expect(
      toastAdd.mock.calls.map(([{ title, description }]) => ({ title, description })),
    ).toContainEqual({
      title: "The import stopped unexpectedly",
      description: "Reload the page to see which items were imported.",
    }),
  );
});
