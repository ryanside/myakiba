import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderInApp, resetServer } from "../../../test/add-app";
import type { ItemDetail } from "@/components/item/types";

const { AppCommand } = await import("@/components/command/app-command");
const { ItemCollection } = await import("@/components/item/item-collection");
const { ItemNotFound } = await import("@/components/item/item-not-found");
const { AddLink } = await import("./add-link");

beforeEach(resetServer);
afterEach(cleanup);

const pending = async () => ({ isOk: () => true }) as never;

test("the missing item page links to the Add page with the MFC hint", async () => {
  renderInApp(<ItemNotFound externalId={98_777} />);
  const link = await screen.findByRole("link", { name: "Add this item" });
  expect(link.getAttribute("href")).toBe("/add?mfc=98777&returnTo=%2Fadd");
});

test("an item page offers the Add page with that Item as a row, preset from context", async () => {
  renderInApp(
    <ItemCollection
      item={{ id: "itemalpha0001" } as ItemDetail}
      externalId={98_777}
      collectionItems={[]}
      ordersList={[]}
      isPending={false}
      isError={false}
      errorMessage={undefined}
      onEditCollectionItem={pending}
      onDeleteCollectionItems={pending}
      onMoveToExistingOrder={pending}
      onMoveToNewOrder={pending}
      isCollectionOrderPending={() => false}
    />,
  );
  const collection = await screen.findByRole("link", { name: "Add to collection" });
  expect(collection.getAttribute("href")).toBe(
    "/add?item=itemalpha0001&to=collection&returnTo=%2Fadd",
  );
  expect(screen.getByRole("link", { name: "Add to an order" }).getAttribute("href")).toBe(
    "/add?item=itemalpha0001&to=order-new&returnTo=%2Fadd",
  );
});

test.each([
  [{ to: "collection" }, "/add?to=collection&returnTo=%2Fadd"],
  [{ to: "order-new" }, "/add?to=order-new&returnTo=%2Fadd"],
  [{ to: "order:orderid12345" }, "/add?to=order%3Aorderid12345&returnTo=%2Fadd"],
  [{ to: "wishlist" }, "/add?to=wishlist&returnTo=%2Fadd"],
  [{ to: "none" }, "/add?to=none&returnTo=%2Fadd"],
  [undefined, "/add?returnTo=%2Fadd"],
])("a page's Add link with %j goes to %s", async (search, href) => {
  renderInApp(<AddLink search={search} />);
  const link = await screen.findByRole("link", { name: "Add" });
  expect(link.getAttribute("href")).toBe(href);
});

test("the command palette's Add items opens the Add page, and the old paste forms are gone", async () => {
  const user = userEvent.setup();
  const router = renderInApp(<AppCommand />);
  await user.click(await screen.findByRole("button", { name: "Search" }));

  const addItems = await screen.findByRole("option", { name: /^Add items/u });
  expect(screen.queryByRole("option", { name: /^Add to collection/u })).toBeNull();
  expect(screen.queryByRole("option", { name: /^Create order/u })).toBeNull();
  await user.click(addItems);

  await waitFor(() => expect(router.state.location.pathname).toBe("/add"));
});
