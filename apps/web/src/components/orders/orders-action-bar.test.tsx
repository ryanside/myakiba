import { afterEach, expect, mock, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { OrderFill } from "@myakiba/contracts/orders/fill";
import { Result } from "better-result";
import { useState } from "react";
import type { Saving } from "@/data/client";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

await mock.module("@/hooks/use-user-preferences", () => ({
  useUserPreferences: () => ({ currency: "USD", locale: "en-US", dateFormat: "MM/DD/YYYY" }),
}));
const { OrdersActionBar } = await import("./orders-action-bar");

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;
type Fill =
  | { readonly kind: "orders"; readonly ids: readonly string[]; readonly fill: OrderFill }
  | { readonly kind: "items"; readonly ids: readonly string[]; readonly fill: ItemFill };

const ORDERS = ["od-alpha", "od-bravo"];
const ITEMS = new Map([
  ["co-miku", "od-alpha"],
  ["co-rin", "od-charlie"],
]);

function renderBar(initial: { readonly orders: readonly string[]; readonly items: boolean }) {
  const fills: Fill[] = [];
  function OrdersPage() {
    const [orders, setOrders] = useState<ReadonlySet<string>>(() => new Set(initial.orders));
    const [items, setItems] = useState(() => (initial.items ? ITEMS : new Map<string, string>()));
    const saved = async (fill: Fill): Saving => {
      fills.push(fill);
      return Result.ok();
    };
    const write = async (): Saving => Result.ok();
    return (
      <>
        <p aria-label="selection">{[...orders, ...items.keys()].join(",")}</p>
        <OrdersActionBar
          selectedOrderIds={orders}
          selectedItems={{
            collectionIds: new Set(items.keys()),
            orderIds: new Set(items.values()),
          }}
          onClearOrderSelection={() => setOrders(new Set())}
          onClearSelection={() => {
            setOrders(new Set());
            setItems(new Map());
          }}
          onMerge={write}
          onSplit={write}
          onDeleteOrders={write}
          onMoveItem={write}
          onDeleteItems={write}
          onFillOrders={(ids, fill) => saved({ kind: "orders", ids: [...ids], fill })}
          onFillItems={(ids, fill) => saved({ kind: "items", ids: [...ids], fill })}
          isMerging={false}
          isSplitting={false}
          isDeletingOrders={false}
          isDeletingItems={false}
          isMovingItems={false}
          isFillingOrders={false}
          isFillingItems={false}
        />
      </>
    );
  }
  const queryClient = new QueryClient();
  queryClient.setQueryData(["vocabulary"], { shops: [], tags: [], scales: [] });
  render(
    <QueryClientProvider client={queryClient}>
      <OrdersPage />
    </QueryClientProvider>,
  );
  return fills;
}

const selection = () => screen.getByLabelText("selection").textContent;
const popup = () => screen.queryByRole("dialog", { name: "Fill all" });

async function openFill(user: User) {
  await user.click(await screen.findByRole("button", { name: "Fill" }));
  return screen.findByRole("dialog", { name: "Fill all" });
}

async function fillShop(user: User, group: HTMLElement, count: number) {
  await user.click(within(group).getByRole("button", { name: "Shop" }));
  await waitFor(() => expect(document.activeElement?.id).toBe("fill-shop"));
  await user.type(screen.getByRole("combobox", { name: "Shop" }), "AmiAmi");
  await user.click(screen.getByRole("button", { name: `Fill ${count} selected` }));
  await waitFor(() => expect(popup()).toBeNull());
}

test("Orders alone list their fields with no heading", async () => {
  renderBar({ orders: ORDERS, items: false });
  const fillAll = await openFill(userEvent.setup());

  expect(within(fillAll).getByText("Write one value to 2 selected orders.")).toBeDefined();
  expect(within(fillAll).queryByRole("group")).toBeNull();
  expect(within(fillAll).getAllByRole("button")).toHaveLength(8);
  expect(within(fillAll).queryByRole("button", { name: "Paid" }) !== null).toBe(true);
});

test("Order Items alone list their fields with no heading", async () => {
  renderBar({ orders: [], items: true });
  const fillAll = await openFill(userEvent.setup());

  expect(within(fillAll).getByText("Write one value to 2 selected items.")).toBeDefined();
  expect(within(fillAll).queryByRole("group")).toBeNull();
  expect(within(fillAll).getAllByRole("button")).toHaveLength(13);
  expect(within(fillAll).queryByRole("button", { name: "Paid" }) === null).toBe(true);
});

test("Orders and Order Items together fill through their own handlers and keep both selections", async () => {
  const fills = renderBar({ orders: ORDERS, items: true });
  const user = userEvent.setup();
  const everything = [...ORDERS, ...ITEMS.keys()].join(",");

  const fillAll = await openFill(user);
  expect(
    within(fillAll).getByText("Write one value to 2 selected orders and 2 selected items."),
  ).toBeDefined();
  await fillShop(user, within(fillAll).getByRole("group", { name: "Orders" }), 2);
  expect(selection()).toBe(everything);
  expect(screen.getByRole("toolbar")).toBeDefined();

  const again = await openFill(user);
  await fillShop(user, within(again).getByRole("group", { name: "Order Items" }), 2);
  expect(selection()).toBe(everything);

  expect(fills).toEqual([
    { kind: "orders", ids: ORDERS, fill: { field: "shop", value: "AmiAmi" } },
    { kind: "items", ids: [...ITEMS.keys()], fill: { field: "shop", value: "AmiAmi" } },
  ]);
});

test("Escape closes the popover first, and only then both selections", async () => {
  renderBar({ orders: ORDERS, items: true });
  const user = userEvent.setup();
  await openFill(user);
  act(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  await user.keyboard("{Escape}");
  await waitFor(() => expect(popup()).toBeNull());
  expect(selection()).toBe([...ORDERS, ...ITEMS.keys()].join(","));

  await user.keyboard("{Escape}");
  await waitFor(() => expect(selection()).toBe(""));
});
