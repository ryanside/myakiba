import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataTransfer } from "./index";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const COMPLETED_IMPORT = {
  id: "import-1",
  fileName: "myakiba-export.json",
  status: "completed",
  importedOrders: 1,
  importedCollectionItems: 2,
  failedCollectionItems: 0,
  report: null,
  error: null,
};

type Answer = (request: { readonly url: string; readonly method: string }) => Response | null;

function serve(answer: Answer) {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = { url: String(input), method: init?.method ?? "GET" };
      return answer(request) ?? Response.json(COMPLETED_IMPORT);
    },
    { preconnect: realFetch.preconnect },
  );
}

async function openDataTransfer(answer: Answer) {
  serve(answer);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DataTransfer />
    </QueryClientProvider>,
  );
  await screen.findByText("myakiba-export.json");
}

test("an export the server refuses shows safe text beside the button", async () => {
  await openDataTransfer(({ url }) =>
    url.endsWith("/export") ? new Response("Export storage is unavailable", { status: 500 }) : null,
  );

  act(() => screen.getByRole("button", { name: "Download export" }).click());

  expect(await screen.findByText("Failed to export your data")).toBeTruthy();
});

test("a delete the server refuses closes the dialog and shows its text beside the import", async () => {
  await openDataTransfer(({ method }) =>
    method === "DELETE" ? new Response("The import is still running", { status: 409 }) : null,
  );

  act(() => screen.getByRole("button", { name: "Delete session" }).click());
  const dialog = await screen.findByRole("dialog");
  act(() => within(dialog).getByRole("button", { name: "Delete session" }).click());

  expect(await screen.findByText("The import is still running")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
