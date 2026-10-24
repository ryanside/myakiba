import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";

const router = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({ ...router, useNavigate: () => mock() }));
const { useSyncMutations } = await import("./use-sync-mutations");

afterEach(cleanup);

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
