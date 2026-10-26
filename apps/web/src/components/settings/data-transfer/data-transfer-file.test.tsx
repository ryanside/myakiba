import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DATA_TRANSFER_FORMAT,
  DATA_TRANSFER_MAX_BYTES,
  DATA_TRANSFER_VERSION,
} from "@myakiba/contracts/data-transfer/schema";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DataTransfer } from "./index";

/** The settings rows read the URL, so the screen renders inside a router. */
function inRouter(screenUi: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => screenUi }),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  return <RouterProvider router={router} />;
}

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const order = {
  orderKey: "order-1",
  title: "Order",
  shop: "AmiAmi",
  orderDate: null,
  releaseDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "EMS",
  status: "Ordered",
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const archive = (orders: readonly unknown[]) =>
  JSON.stringify({
    format: DATA_TRANSFER_FORMAT,
    version: DATA_TRANSFER_VERSION,
    exportId: "export-1",
    exportedAt: "2026-01-01T00:00:00.000Z",
    source: { application: "myakiba" },
    orders,
    collectionItems: [],
  });

const exportFile = (text: string, name = "export.json", type = "application/json") =>
  new File([text], name, { type });

async function chooseExport(file: File) {
  globalThis.fetch = Object.assign(async () => Response.json(null), {
    preconnect: realFetch.preconnect,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>{inRouter(<DataTransfer />)}</QueryClientProvider>,
  );
  await screen.findByText("Choose export");
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("The import dropzone has no file input");
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

test("a valid export shows what it will import", async () => {
  await chooseExport(exportFile(archive([order])));

  expect(await screen.findByText("Orders")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test.each([
  ["not JSON", exportFile("{format:"), "This file is not valid JSON."],
  ["an export with nothing in it", exportFile(archive([])), "This myakiba export is empty."],
  [
    "a file the browser cannot read",
    Object.assign(exportFile("{}"), {
      text: () =>
        Promise.reject(new DOMException("The file could not be read", "NotReadableError")),
    }),
    "The file could not be read",
  ],
  [
    "a file that is not JSON by type",
    exportFile("{}", "notes.txt", "text/plain"),
    "File type must be one of application/json, .json",
  ],
  [
    "a file over the import limit",
    Object.defineProperty(exportFile("{}"), "size", { value: DATA_TRANSFER_MAX_BYTES + 1 }),
    "File is larger than 50 MB",
  ],
])("choosing %s shows why beside the import", async (_case, file, reason) => {
  await chooseExport(file);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(reason);
  expect(screen.queryByText("Orders")).toBeNull();
});
