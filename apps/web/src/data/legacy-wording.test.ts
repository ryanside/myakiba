import { afterEach, expect, test } from "bun:test";
import * as sync from "@/queries/sync";
import * as transfer from "@/queries/data-transfer";
import { getResyncStatus, requestResync } from "@/queries/item";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const order = {
  title: "Order",
  shop: "",
  status: "Ordered",
  shippingMethod: "n/a",
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  items: [],
  orderDate: null,
  releaseDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
} satisfies Parameters<typeof sync.sendOrder>[0];
const archive = {
  format: "myakiba-data-transfer",
  version: 1,
  exportId: "export",
  exportedAt: "2026-10-24T00:00:00Z",
  source: { application: "myakiba" },
  orders: [],
  collectionItems: [],
} satisfies Parameters<typeof transfer.startDataTransferImport>[0]["archive"];

const callers = [
  ["CSV sync", () => sync.sendItems([]), "Failed to submit MyFigureCollection CSV"],
  ["item sync", () => sync.sendItemSync({ items: [1] }), "Failed to submit item database items"],
  ["order sync", () => sync.sendOrder(order), "Failed to submit order"],
  [
    "order item sync",
    () => sync.sendOrderItems({ orderId: "order", items: [] }),
    "Failed to submit order items",
  ],
  ["collection sync", () => sync.sendCollection([]), "Failed to submit collection items"],
  ["import history", () => sync.fetchSyncSessions({}), "Failed to load import history"],
  ["import details", () => sync.fetchSyncSessionDetail("session"), "Failed to load import details"],
  ["sync retry", () => sync.retrySyncSession("session"), "Failed to retry failed item results"],
  ["data export", transfer.exportDataTransfer, "Failed to export your data"],
  ["import status", transfer.getCurrentDataTransferImport, "Failed to check import status"],
  [
    "start import",
    () => transfer.startDataTransferImport({ fileName: "backup.json", archive }),
    "Failed to start import",
  ],
  ["retry import", transfer.retryCurrentDataTransferImport, "Failed to retry import"],
  [
    "delete import",
    transfer.deleteCurrentDataTransferImport,
    "Failed to delete the import session",
  ],
  ["refresh status", () => getResyncStatus(1), "Failed to check item refresh status"],
  [
    "refresh item",
    () => requestResync(1, { page: new File(["page"], "page.html") }),
    "Failed to request item refresh",
  ],
] as const;

for (const [screen, request, fallback] of callers) {
  test(`${screen} hides server, validator and network details`, async () => {
    for (const respond of [
      async () => new Response("private server failure", { status: 500 }),
      async () => Response.json({ message: "Expected string" }, { status: 422 }),
      async (): Promise<Response> => {
        throw new TypeError("Failed to fetch");
      },
    ]) {
      globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
      expect(await request()).toMatchObject({ status: "error", error: { message: fallback } });
    }
  });
}
