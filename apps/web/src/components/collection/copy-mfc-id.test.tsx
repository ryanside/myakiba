import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ReactNode } from "react";
import type { CollectionItem } from "@myakiba/contracts/collection/types";
import { Toaster } from "@/components/ui/toast";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { readonly children?: ReactNode }) => <a href="/">{children}</a>,
}));
const { CollectionItemControls } = await import("./collection-item-controls");

afterEach(cleanup);

const ITEM: CollectionItem = {
  id: "co-miku",
  orderId: null,
  itemId: "it-miku",
  itemExternalId: 1006,
  itemTitle: "Hatsune Miku 1/7",
  itemImage: null,
  itemCategory: null,
  itemScale: null,
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const saved = async () => Result.ok();

/** Copies the item's MFC ID through a clipboard whose `writeText` is `write`, and returns its calls. */
async function copyMfcId(item: CollectionItem, write: (text: string) => Promise<void>) {
  // user-event replaces the clipboard when it sets up, so the spy goes on its clipboard.
  const user = userEvent.setup();
  const written = spyOn(navigator.clipboard, "writeText").mockImplementation(write);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Toaster>
        <CollectionItemControls
          item={item}
          itemSize={300}
          variant="card"
          isPending={false}
          isSelected={false}
          onEditCollectionItem={saved}
          onDeleteCollectionItems={saved}
          onAddCollectionItemsToOrder={saved}
          onAddCollectionItemsToNewOrder={saved}
          onToggleSelection={() => {}}
          currency="USD"
          dateFormat="MM/DD/YYYY"
        />
      </Toaster>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: /Open menu/u }));
  await user.click(await screen.findByRole("menuitem", { name: "Copy MFC ID" }));
  return written.mock.calls;
}

test("copying an item's MFC ID puts it on the clipboard and says so", async () => {
  const written = await copyMfcId(ITEM, async () => {});

  expect(await screen.findByText("Copied MFC item ID to clipboard")).toBeTruthy();
  expect(written).toEqual([["1006"]]);
});

test("a clipboard that refuses the MFC ID says it could not copy", async () => {
  await copyMfcId(ITEM, () =>
    Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")),
  );

  expect(await screen.findByText("Could not copy MFC item ID to clipboard")).toBeTruthy();
  expect(screen.queryByText("Copied MFC item ID to clipboard")).toBeNull();
});
