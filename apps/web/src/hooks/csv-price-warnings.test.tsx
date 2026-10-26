import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";

const WARNINGS = [
  { mfcItemId: 101, input: "12,50" },
  { mfcItemId: 202, input: "abc" },
  { mfcItemId: 303, input: "1.234" },
];
const UNREAD = "3 items had prices we couldn't read and were saved without one.";

const finishedAtOnce = {
  status: "Added from the item database",
  isFinished: true,
  existingItemsToInsert: 3,
  newItems: 0,
  jobId: null,
  syncSessionId: "session-1",
  missingMfcItemIds: [],
  warnings: WARNINGS,
};

const endedJob = {
  jobId: "job-1",
  phase: "completed",
  statusMessage: "Import complete",
  progress: { processed: 3, total: 3, succeeded: 3, failed: 0 },
  recentItems: [],
  error: null,
  startedAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-26T00:01:00.000Z",
  terminalState: "success",
  warnings: WARNINGS,
};

async function* stream(...chunks: unknown[]) {
  for (const data of chunks) yield { data };
}

const realClient = await import("@/lib/treaty-client");
await mock.module("@/lib/treaty-client", () => ({
  ...realClient,
  app: {
    api: {
      sync: {
        csv: { post: async () => ({ data: finishedAtOnce, error: null }) },
        "job-status": { get: async () => ({ data: stream(endedJob), error: null }) },
      },
    },
  },
}));
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
}));
const realGate = await import("@/lib/extension-gate");
await mock.module("@/lib/extension-gate", () => ({
  ...realGate,
  requireExtension: async () => Result.ok(),
}));

const { useSyncMutations } = await import("./use-sync-mutations");
const { useSyncJobStatusQuery } = await import("./use-sync-job-status-query");

afterEach(cleanup);

function wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>{children}</Toaster>
    </QueryClientProvider>
  );
}

const CSV_HEADER =
  "ID,Title,Root,Category,Release Date,Price,Scale,Barcode,Status,Count,Score,Payment Date,Shipping Date,Collecting Date,Price,Shop,Shipping Method,Tracking Number,Wishibility,Note";
const csvLine = (id: number, price: string) =>
  `${id},"Figure ${id}",Figures,Prepainted,2024-01-01,"¥10,000",1/7,,Owned,1,8/10,2024-02-01,,,"${price}",AmiAmi,EMS,,,`;

test("a CSV import that finishes at once counts its unread prices in its toast", async () => {
  const { result } = renderHook(() => useSyncMutations(), { wrapper });
  const file = new File(
    [`${CSV_HEADER}\n${csvLine(101, "12,50")}\n${csvLine(202, "abc")}\n${csvLine(303, "1.234")}`],
    "mfc.csv",
    { type: "text/csv" },
  );

  await act(async () => {
    await result.current.handleSyncCsvSubmit(file);
  });

  expect(await screen.findByText(new RegExp(UNREAD.replaceAll(".", "\\.")))).toBeTruthy();
});

test("a CSV import run that ends counts its unread prices in its toast", async () => {
  renderHook(() => useSyncJobStatusQuery("job-1", "session-1", "csv"), { wrapper });

  expect(await screen.findByText(new RegExp(UNREAD.replaceAll(".", "\\.")))).toBeTruthy();
});
