import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { OrderFill } from "@myakiba/contracts/orders/fill";
import { Result } from "better-result";
import { Button } from "@/components/ui/button";
import type { Saving } from "@/data/client";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";
import { MONEY_INPUT_HINT } from "@/lib/money-input";
import { SavedFillMenu } from "./saved-fill-menu";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;
type Sent = { readonly ids: readonly string[]; readonly fill: ItemFill };

const IDS = new Set(["co-loaded", "co-on-another-page"]);

function renderMenu(selected: ReadonlySet<string> = IDS) {
  const sent: Sent[] = [];
  const onFill = async (ids: ReadonlySet<string>, fill: ItemFill): Saving => {
    sent.push({ ids: [...ids], fill });
    return Result.ok();
  };
  const queryClient = new QueryClient();
  queryClient.setQueryData(["vocabulary"], { shops: [], tags: [], scales: [] });
  render(
    <QueryClientProvider client={queryClient}>
      <SavedFillMenu
        rows={[{ target: "collection", ids: selected, onFill }]}
        currency="USD"
        trigger={<Button>Fill</Button>}
      />
    </QueryClientProvider>,
  );
  return sent;
}

async function choose(user: User, field: string) {
  await user.click(screen.getByRole("button", { name: "Fill" }));
  const popup = await screen.findByRole("dialog", { name: "Fill all" });
  await user.click(within(popup).getByRole("button", { name: field }));
  await waitFor(() =>
    expect(within(popup).queryByRole("button", { name: "All fields" }) !== null).toBe(true),
  );
  await waitFor(() => {
    const focused = document.activeElement;
    expect(focused !== popup && focused !== null && popup.contains(focused)).toBe(true);
  });
}

const fillButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Fill 2 selected" });

async function submit(user: User) {
  await user.click(fillButton());
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill all" })).toBeNull());
}

const filled = (fill: ItemFill): Sent[] => [{ ids: [...IDS], fill }];

test("a selection past the server's id limit cannot be filled, and says to select fewer", async () => {
  const tooMany = new Set(
    Array.from({ length: WRITE_LIMITS.ids + 1 }, (_, index) => `co-${index}`),
  );
  const sent = renderMenu(tooMany);
  const user = userEvent.setup();
  await choose(user, "Shop");

  const fill = screen.getByRole<HTMLButtonElement>("button", { name: "Fill 1001 selected" });
  expect(fill.disabled).toBe(true);
  expect(screen.getByText("Select 1,000 items or fewer to fill.")).toBeDefined();
  expect(sent).toEqual([]);
});

test("offers every Collection Item field but Status, and counts items", async () => {
  renderMenu();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Fill" }));

  await screen.findByText("Write one value to 2 selected items.");
  const offered = document.querySelectorAll("[data-fill-list] button");
  expect([...offered].map(({ textContent }) => textContent)).toEqual([
    "Price",
    "Count",
    "Condition",
    "Shop",
    "Order Date",
    "Payment Date",
    "Shipping Date",
    "Collection Date",
    "Shipping Method",
    "Score",
    "Tags",
    "Notes",
  ]);
});

test("a blank price is refused once edited, an unreadable one too, and 0 is a price", async () => {
  const sent = renderMenu();
  const user = userEvent.setup();
  await choose(user, "Price");
  const price = screen.getByRole("textbox", { name: "Price" });

  expect(fillButton().disabled).toBe(true);
  expect(screen.queryByText("Enter a price.")).toBeNull();

  await user.type(price, "5");
  await user.clear(price);
  expect(screen.getByText("Enter a price.")).toBeDefined();
  expect(fillButton().disabled).toBe(true);

  await user.type(price, "99999999999999999");
  expect(screen.getByText(MONEY_INPUT_HINT)).toBeDefined();
  expect(fillButton().disabled).toBe(true);

  await user.clear(price);
  await user.type(price, "0");
  expect(screen.getByText("Replaces Price on every selected item.")).toBeDefined();
  await submit(user);
  expect(sent).toEqual(filled({ field: "price", value: 0 }));
});

test("a count outside 1 to 999 or with a fraction is refused, never clamped", async () => {
  const sent = renderMenu();
  const user = userEvent.setup();
  await choose(user, "Count");
  const count = screen.getByRole("spinbutton", { name: "Count" });

  for (const text of ["0", "1000", "2.5"]) {
    fireEvent.change(count, { target: { value: text } });
    expect(screen.getByText("Enter a whole number from 1 to 999.")).toBeDefined();
    expect(fillButton().disabled).toBe(true);
  }

  fireEvent.change(count, { target: { value: "3" } });
  await submit(user);
  expect(sent).toEqual(filled({ field: "count", value: 3 }));
});

test("a shop is trimmed, and a blank one clears Shop on every selected item", async () => {
  const sent = renderMenu();
  const user = userEvent.setup();

  await choose(user, "Shop");
  expect(screen.getByText("Clears Shop on every selected item.")).toBeDefined();
  await user.type(screen.getByRole("combobox", { name: "Shop" }), "  AmiAmi  ");
  expect(screen.getByText("Replaces Shop on every selected item.")).toBeDefined();
  await submit(user);

  await choose(user, "Shop");
  await submit(user);

  expect(sent).toEqual([
    ...filled({ field: "shop", value: "AmiAmi" }),
    ...filled({ field: "shop", value: "" }),
  ]);
});

test("blank notes and an unpicked date clear their field", async () => {
  const sent = renderMenu();
  const user = userEvent.setup();

  await choose(user, "Notes");
  await user.type(screen.getByRole("textbox", { name: "Notes" }), "   ");
  expect(screen.getByText("Clears Notes on every selected item.")).toBeDefined();
  await submit(user);

  await choose(user, "Payment Date");
  expect(screen.getByText("Clears Payment Date on every selected item.")).toBeDefined();
  await submit(user);

  expect(sent).toEqual([
    ...filled({ field: "notes", value: "" }),
    ...filled({ field: "paymentDate", value: null }),
  ]);
});

test("a score is sent as text", async () => {
  const sent = renderMenu();
  const user = userEvent.setup();

  await choose(user, "Score");
  const stars = within(screen.getByRole("group", { name: "Score for every selected item" }));
  await user.click(stars.getAllByRole("button")[6] as HTMLElement);
  await submit(user);

  expect(sent).toEqual(filled({ field: "score", value: "7" }));
});

test("tags are added, and an empty list is refused", async () => {
  const sent = renderMenu();
  const user = userEvent.setup();
  await choose(user, "Tags");

  expect(screen.getByText("Adds to the tags each item already has.")).toBeDefined();
  expect(fillButton().disabled).toBe(true);
  const tags = screen.getByRole("combobox", { name: "Tags" });
  await user.type(tags, "figure{Enter}");
  await user.click(screen.getByRole("button", { name: "Remove tag figure" }));
  expect(screen.getByText("Add at least one tag.")).toBeDefined();

  await user.type(tags, "figure{Enter}");
  await submit(user);
  expect(sent).toEqual(filled({ field: "tags", value: ["figure"] }));
});

type OrdersSent = { readonly orderIds: readonly string[]; readonly fill: OrderFill };

function renderOrdersMenu(selected: { readonly orders: number; readonly items: number }) {
  const sent: (Sent | OrdersSent)[] = [];
  const orderIds = new Set(["od-alpha", "od-bravo"].slice(0, selected.orders));
  const itemIds = new Set(["co-miku", "co-rin", "co-len"].slice(0, selected.items));
  const queryClient = new QueryClient();
  queryClient.setQueryData(["vocabulary"], { shops: [], tags: [], scales: [] });
  render(
    <QueryClientProvider client={queryClient}>
      <SavedFillMenu
        rows={[
          {
            target: "orders",
            ids: orderIds,
            onFill: async (ids, fill) => {
              sent.push({ orderIds: [...ids], fill });
              return Result.ok();
            },
          },
          {
            target: "orderItems",
            ids: itemIds,
            onFill: async (ids, fill) => {
              sent.push({ ids: [...ids], fill });
              return Result.ok();
            },
          },
        ]}
        currency="USD"
        trigger={<Button>Fill</Button>}
      />
    </QueryClientProvider>,
  );
  return sent;
}

const offeredIn = (scope: HTMLElement) =>
  [...scope.querySelectorAll("button")].map(({ textContent }) => textContent);

test("Order Items offer Status and every Collection Item field, and a fill sends their ids", async () => {
  const sent = renderOrdersMenu({ orders: 0, items: 3 });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Fill" }));

  const popup = await screen.findByRole("dialog", { name: "Fill all" });
  expect(within(popup).getByText("Write one value to 3 selected items.")).toBeDefined();
  expect(within(popup).queryByRole("group")).toBeNull();
  expect(offeredIn(popup)).toEqual([
    "Status",
    "Price",
    "Count",
    "Condition",
    "Shop",
    "Order Date",
    "Payment Date",
    "Shipping Date",
    "Collection Date",
    "Shipping Method",
    "Score",
    "Tags",
    "Notes",
  ]);

  await user.click(within(popup).getByRole("button", { name: "Status" }));
  expect(await screen.findByText("Replaces Status on every selected item.")).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Fill 3 selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill all" })).toBeNull());
  expect(sent).toEqual([
    { ids: ["co-miku", "co-rin", "co-len"], fill: { field: "status", value: "Owned" } },
  ]);
});

test("Orders offer the eight fields they cascade, and say the fill sets their items too", async () => {
  const sent = renderOrdersMenu({ orders: 2, items: 0 });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Fill" }));

  const popup = await screen.findByRole("dialog", { name: "Fill all" });
  expect(within(popup).getByText("Write one value to 2 selected orders.")).toBeDefined();
  expect(within(popup).queryByRole("group")).toBeNull();
  expect(offeredIn(popup)).toEqual([
    "Status",
    "Paid",
    "Shop",
    "Order Date",
    "Payment Date",
    "Shipping Date",
    "Collection Date",
    "Shipping Method",
  ]);

  await user.click(within(popup).getByRole("button", { name: "Shop" }));
  await waitFor(() => expect(document.activeElement?.id).toBe("fill-shop"));
  expect(
    screen.getByText("Clears Shop on every selected order and every item in those orders."),
  ).toBeDefined();
  await user.type(screen.getByRole("combobox", { name: "Shop" }), " AmiAmi ");
  expect(
    screen.getByText("Replaces Shop on every selected order and every item in those orders."),
  ).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Fill 2 selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill all" })).toBeNull());
  expect(sent).toEqual([
    { orderIds: ["od-alpha", "od-bravo"], fill: { field: "shop", value: "AmiAmi" } },
  ]);
});

test("an Orders fill of Paid starts checked, says nothing beside the checkbox, and sets only the Orders", async () => {
  const sent = renderOrdersMenu({ orders: 2, items: 0 });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Fill" }));
  const popup = await screen.findByRole("dialog", { name: "Fill all" });
  await user.click(within(popup).getByRole("button", { name: "Paid" }));

  const paid = await screen.findByRole("checkbox", { name: "Paid" });
  expect(paid.getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByText(/Replaces Paid/u) === null).toBe(true);
  await user.click(paid);
  await user.click(screen.getByRole("button", { name: "Fill 2 selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill all" })).toBeNull());
  expect(sent).toEqual([
    { orderIds: ["od-alpha", "od-bravo"], fill: { field: "paid", value: false } },
  ]);
});

test("Orders and Order Items selected together list their fields under two headings", async () => {
  const sent = renderOrdersMenu({ orders: 1, items: 2 });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Fill" }));

  const popup = await screen.findByRole("dialog", { name: "Fill all" });
  expect(
    within(popup).getByText("Write one value to 1 selected order and 2 selected items."),
  ).toBeDefined();
  const orders = within(popup).getByRole("group", { name: "Orders" });
  const items = within(popup).getByRole("group", { name: "Order Items" });
  expect([offeredIn(orders).length, offeredIn(items).length]).toEqual([8, 13]);

  await user.click(within(items).getByRole("button", { name: "Shop" }));
  expect(await screen.findByText("Clears Shop on every selected item.")).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Fill 2 selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill all" })).toBeNull());

  await user.click(screen.getByRole("button", { name: "Fill" }));
  const reopened = await screen.findByRole("dialog", { name: "Fill all" });
  await user.click(
    within(within(reopened).getByRole("group", { name: "Orders" })).getByRole("button", {
      name: "Shop",
    }),
  );
  expect(
    await screen.findByText("Clears Shop on every selected order and every item in those orders."),
  ).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Fill 1 selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill all" })).toBeNull());

  expect(sent).toEqual([
    { ids: ["co-miku", "co-rin"], fill: { field: "shop", value: "" } },
    { orderIds: ["od-alpha"], fill: { field: "shop", value: "" } },
  ]);
});
