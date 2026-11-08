import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import { Button } from "@/components/ui/button";
import type { Saving } from "@/data/client";
import { WriteFailed } from "@/lib/errors/write-failed";
import CollectionItemForm from "./collection-item-form";

afterEach(cleanup);

const ITEM: CollectionItemFormValues = {
  id: "co-miku",
  orderId: null,
  itemId: "it-miku",
  itemExternalId: 1006,
  itemTitle: "Hatsune Miku 1/7",
  itemImage: null,
  status: "Owned",
  count: 1,
  score: "0",
  price: 1000,
  shop: "AmiAmi",
  condition: "New",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "n/a",
  tags: [],
  notes: "",
  releaseId: null,
  releaseDate: null,
  releasePrice: null,
  releaseType: null,
  releaseCurrency: null,
  releaseBarcode: null,
};

async function submitEdit(callbackFn: () => Saving, price?: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CollectionItemForm
        renderTrigger={<Button>Edit</Button>}
        itemData={ITEM}
        callbackFn={callbackFn}
        currency="USD"
      />
    </QueryClientProvider>,
  );
  act(() => screen.getByRole("button", { name: "Edit" }).click());
  await screen.findByText("Edit Item");
  if (price !== undefined)
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: price } });
  act(() => screen.getByRole("button", { name: "Update" }).click());
}

test("an edit the server refuses keeps the sheet open for another try", async () => {
  let writes = 0;
  await submitEdit(async () => {
    writes++;
    const cause = new Error("Failed to update collection item");
    return Result.err(new WriteFailed({ cause, message: cause.message }));
  });

  await waitFor(() => expect(writes).toBe(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Update" })).toMatchObject({ disabled: false }),
  );
  expect(screen.getByText("Edit Item")).toBeTruthy();
});

test("an edit that saves closes the sheet", async () => {
  await submitEdit(async () => Result.ok());

  await waitFor(() => expect(screen.queryByText("Edit Item")).toBeNull());
});

test("a price too large to save shows a field error and saves nothing", async () => {
  let writes = 0;
  await submitEdit(async () => {
    writes++;
    return Result.ok();
  }, "90071992547409.92");

  expect(await screen.findByText("Enter an amount like 1,234.50")).toBeTruthy();
  expect(screen.getByLabelText("Price").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("Edit Item")).toBeTruthy();
  expect(writes).toBe(0);
});
