import { describe, expect, test } from "bun:test";
import {
  DATA_TRANSFER_FORMAT,
  DATA_TRANSFER_VERSION,
} from "@myakiba/contracts/data-transfer/schema";
import { readDataTransferFile } from "./data-transfer";

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

const archive = (orders: readonly unknown[]) => ({
  format: DATA_TRANSFER_FORMAT,
  version: DATA_TRANSFER_VERSION,
  exportId: "export-1",
  exportedAt: "2026-01-01T00:00:00.000Z",
  source: { application: "myakiba" },
  orders,
  collectionItems: [],
});

const exportFile = (text: string) => new File([text], "export.json", { type: "application/json" });

describe("readDataTransferFile", () => {
  test("reads a valid export", async () => {
    const valid = archive([order]);
    const read: unknown = await readDataTransferFile(exportFile(JSON.stringify(valid)));

    expect(read).toEqual(valid);
  });

  test("says the file is not valid JSON when it does not parse", async () => {
    await expect(readDataTransferFile(exportFile("{format:"))).rejects.toThrow(
      new Error("This file is not valid JSON."),
    );
  });

  test("shows the first schema issue when the JSON is not a supported export", async () => {
    await expect(readDataTransferFile(exportFile(JSON.stringify(archive([]))))).rejects.toThrow(
      new Error("This myakiba export is empty."),
    );
  });
});
