import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";

const router = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({ ...router, useNavigate: () => mock() }));
const { useSyncMutations } = await import("./use-sync-mutations");

afterEach(cleanup);

const CSV_HEADER =
  "ID,Title,Root,Category,Release Date,Price,Scale,Barcode,Status,Count,Score,Payment Date,Shipping Date,Collecting Date,Price,Shop,Shipping Method,Tracking Number,Wishibility,Note";
const csvLine = (id: number, title: string, status: string) =>
  `${id},"${title}",Figures,Prepainted,2024-01-01,"¥10,000",1/7,,${status},1,8/10,2024-02-01,,,"$80.00",AmiAmi,EMS,,,`;

function renderSyncMutations() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Toaster>{children}</Toaster>
    </QueryClientProvider>
  );
  return renderHook(() => useSyncMutations(), { wrapper }).result;
}

test.each([
  ["no file", undefined, "No file selected"],
  [
    "a file that is not an MFC CSV",
    new File(["name,colour\nfigure,red"], "other.csv", { type: "text/csv" }),
    "Please select a valid MyFigureCollection CSV file",
  ],
  [
    "an MFC CSV with only wished items",
    new File([`${CSV_HEADER}\n${csvLine(4, "Wished figure", "Wished")}`], "mfc.csv", {
      type: "text/csv",
    }),
    "This CSV has no supported Owned or Ordered items to import",
  ],
  [
    "a file the browser cannot read",
    Object.assign(new File(["ID"], "moved.csv", { type: "text/csv" }), {
      text: () =>
        Promise.reject(new DOMException("The file could not be read", "NotReadableError")),
    }),
    "The file could not be read",
  ],
])("does not send and toasts why when the CSV import gets %s", async (_case, file, reason) => {
  const result = renderSyncMutations();

  let submitted: string | undefined;
  await act(async () => {
    submitted = await result.current.handleSyncCsvSubmit(file);
  });

  expect(submitted).toBe("not_sent");
  expect(await screen.findByText("Failed to import MyFigureCollection CSV")).toBeTruthy();
  expect(screen.getByText(reason)).toBeTruthy();
});
