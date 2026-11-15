import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import { Result } from "better-result";
import { useState } from "react";
import type { Saving } from "@/data/client";
import { WriteFailed } from "@/lib/errors/write-failed";
import { OrderItemsActionBar } from "./order-items-action-bar";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;
type Fill = { readonly ids: readonly string[]; readonly fill: ItemFill };

const SELECTED = new Map([
  ["co-miku", "od-alpha"],
  ["co-rin", "od-alpha"],
]);

function renderBar(answer: "ok" | "error") {
  const fills: Fill[] = [];
  function OrderPage() {
    const [selection, setSelection] = useState(SELECTED);
    const onFillItems = async (ids: ReadonlySet<string>, fill: ItemFill): Saving => {
      fills.push({ ids: [...ids], fill });
      if (answer === "ok") return Result.ok();
      const cause = new Error("Some collection items were not found");
      return Result.err(new WriteFailed({ cause, message: cause.message }));
    };
    const write = async (): Saving => Result.ok();
    return (
      <>
        <p aria-label="selection">{[...selection.keys()].join(",")}</p>
        <OrderItemsActionBar
          selectedItems={{
            collectionIds: new Set(selection.keys()),
            orderIds: new Set(selection.values()),
          }}
          currency="USD"
          isMovingItems={false}
          isSplitting={false}
          isDeletingItems={false}
          isDeletingOrders={false}
          isFillingItems={false}
          onClearSelection={() => setSelection(new Map())}
          onMoveItem={write}
          onMoveToNew={write}
          onDeleteItems={write}
          onFillItems={onFillItems}
        />
      </>
    );
  }
  const queryClient = new QueryClient();
  queryClient.setQueryData(["vocabulary"], { shops: [], tags: [], scales: [] });
  render(
    <QueryClientProvider client={queryClient}>
      <OrderPage />
    </QueryClientProvider>,
  );
  return fills;
}

const selection = () => screen.getByLabelText("selection").textContent;
const popup = () => screen.queryByRole("dialog", { name: "Fill all" });

async function fillStatus(user: User) {
  await user.click(await screen.findByRole("button", { name: "Fill" }));
  const fillAll = await screen.findByRole("dialog", { name: "Fill all" });
  expect(within(fillAll).getByText("Write one value to 2 selected items.")).toBeDefined();
  await user.click(within(fillAll).getByRole("button", { name: "Status" }));
  await waitFor(() => expect(document.activeElement?.id).toBe("fill-status"));
  await user.click(screen.getByRole("combobox", { name: "Status" }));
  await user.click(await screen.findByRole("option", { name: "Shipped" }));
  await user.click(screen.getByRole("button", { name: "Fill 2 selected" }));
}

test("a fill of the selected Order Items closes the popover and keeps the selection", async () => {
  const fills = renderBar("ok");
  const user = userEvent.setup();
  await fillStatus(user);

  await waitFor(() => expect(popup()).toBeNull());
  expect(fills).toEqual([
    { ids: [...SELECTED.keys()], fill: { field: "status", value: "Shipped" } },
  ]);
  expect(selection()).toBe([...SELECTED.keys()].join(","));
});

test("a fill that fails keeps the popover, its value and the selection", async () => {
  renderBar("error");
  const user = userEvent.setup();
  await fillStatus(user);

  const retry = await screen.findByRole<HTMLButtonElement>("button", { name: "Fill 2 selected" });
  await waitFor(() => expect(retry.disabled).toBe(false));
  expect(screen.getByRole("combobox", { name: "Status" }).textContent).toContain("Shipped");
  expect(selection()).toBe([...SELECTED.keys()].join(","));
});

test("Escape closes the popover first, and only then the selection", async () => {
  renderBar("ok");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Fill" }));
  await screen.findByRole("dialog", { name: "Fill all" });
  act(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  await user.keyboard("{Escape}");
  await waitFor(() => expect(popup()).toBeNull());
  expect(selection()).toBe([...SELECTED.keys()].join(","));

  await user.keyboard("{Escape}");
  await waitFor(() => expect(selection()).toBe(""));
});
