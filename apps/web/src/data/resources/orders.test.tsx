import { afterEach, describe, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import { act, cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import type { EditedOrder, OrderFilters } from "@myakiba/contracts/orders/schema";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

type ServerOrder = { readonly orderId: string; readonly title: string; readonly total: number };
type Write = { readonly name: string; finish: () => void; fail: () => void };

const ALPHA = { orderId: "od-alpha", title: "Alpha", total: 1000 };
const BRAVO = { orderId: "od-bravo", title: "Bravo", total: 500 };
const CHARLIE = { orderId: "od-charlie", title: "Charlie", total: 200 };

const server = {
  orders: [ALPHA, BRAVO, CHARLIE] as ServerOrder[],
  listReads: 0,
  heldReads: null as Promise<void> | null,
  writes: [] as Write[],
};

function holdListReads() {
  let release = () => {};
  server.heldReads = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    server.heldReads = null;
    await act(async () => release());
  };
}

const listRow = (order: ServerOrder) => ({
  ...order,
  shop: "AmiAmi",
  shippingFee: 100,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  itemCount: 2,
  totalCount: server.orders.length,
  totalSpent: 0,
  activeOrders: 0,
  unpaidCosts: 0,
});

const held =
  (name: string, apply: (...args: never[]) => void) =>
  (...args: never[]): Promise<void> =>
    new Promise((resolve, reject) => {
      server.writes.push({
        name,
        finish: () => {
          apply(...args);
          resolve();
        },
        fail: () => reject(new Error(`${name} rejected by server`)),
      });
    });

const removeOrders = (orderIds: ReadonlySet<string>) => {
  server.orders = server.orders.filter((order) => !orderIds.has(order.orderId));
};
const editServerOrder = (values: EditedOrder) => {
  server.orders = server.orders.map((order) =>
    order.orderId === values.orderId
      ? { ...order, total: order.total + values.shippingFee - 100 }
      : order,
  );
};

await mock.module("@/queries/orders", () => ({
  getOrders: async (filters: OrderFilters) => {
    server.listReads++;
    await server.heldReads;
    const matching = server.orders.filter((order) => order.title.includes(filters.search ?? ""));
    return matching.map((order) => ({ ...listRow(order), totalCount: matching.length }));
  },
  getOrder: async () => {
    throw new Error("no order page in these tests");
  },
  getOrderItems: async () => ({ items: [], totalCount: 0 }),
  getOrderItemReleases: async () => [],
  editOrder: held("edit order", editServerOrder),
  deleteOrders: held("delete orders", removeOrders),
  mergeOrders: held("merge", removeOrders),
  splitOrders: held("split", () => {}),
  deleteOrderItem: held("delete item", () => {}),
  deleteOrderItems: held("delete items", () => {}),
  moveItem: held("move items", () => {}),
}));
await mock.module("@/queries/collection", () => ({
  updateCollectionItem: held("edit item", () => {}),
}));

const url = { filters: {} as OrderFilters, listeners: new Set<() => void>() };
const subscribe = (listener: () => void) => {
  url.listeners.add(listener);
  return () => url.listeners.delete(listener);
};
await mock.module("@/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: useSyncExternalStore(subscribe, () => url.filters),
    setFilters: async () => {},
    resetFilters: async () => {},
  }),
}));

const { toast } = await import("@/components/ui/toast");
const { useOrdersFilters, useOrdersMutations, useOrdersQuery } = await import("@/hooks/use-orders");

const toastAdd = spyOn(toast, "add");
const toastClose = spyOn(toast, "close");

afterEach(() => {
  cleanup();
  server.orders = [ALPHA, BRAVO, CHARLIE];
  server.listReads = 0;
  server.heldReads = null;
  server.writes.length = 0;
  url.filters = {};
  toastAdd.mockClear();
  toastClose.mockClear();
});

type Actions = ReturnType<typeof useOrdersMutations>;

function renderOrdersPage(initialFilters: OrderFilters) {
  url.filters = initialFilters;
  let actions: Actions | null = null;
  function OrdersPage() {
    const { filters } = useOrdersFilters();
    const { orders, totalCount } = useOrdersQuery();
    const mutations = useOrdersMutations({ filters });
    useEffect(() => {
      actions = mutations;
    });
    return (
      <>
        <p aria-label="order count">{totalCount}</p>
        <ul aria-label="orders">
          {orders.map((order) => (
            <li key={order.orderId}>
              {`${order.title} ${order.total}${mutations.isOrderPending(order.orderId) ? " saving" : ""}`}
            </li>
          ))}
        </ul>
      </>
    );
  }
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <OrdersPage />
    </QueryClientProvider>,
  );
  return {
    filterTo: async (next: OrderFilters) => {
      await act(async () => {
        url.filters = next;
        for (const listener of url.listeners) listener();
      });
    },
    act: (run: (current: Actions) => Promise<void>) => {
      if (!actions) throw new Error("the orders page has not rendered");
      return run(actions).then(
        () => "resolved",
        () => "rejected",
      );
    },
  };
}

const shown = () => ({
  count: screen.getByLabelText("order count").textContent,
  orders: [...screen.getByRole("list", { name: "orders" }).querySelectorAll("li")].map(
    (li) => li.textContent,
  ),
});

const loaded = () =>
  waitFor(() =>
    expect(shown()).toEqual({ count: "3", orders: ["Alpha 1000", "Bravo 500", "Charlie 200"] }),
  );

async function answer(index: number, outcome: "finish" | "fail") {
  await waitFor(() => expect(server.writes.length).toBeGreaterThan(index));
  const write = server.writes[index];
  if (!write) throw new Error(`write ${index} never reached the server`);
  await act(async () => write[outcome]());
}

const toastTitles = () =>
  toastAdd.mock.calls.map(([options]) => `${options.type}: ${String(options.title)}`);

const alphaWithShippingFee = (shippingFee: number) =>
  ({
    orderId: ALPHA.orderId,
    title: ALPHA.title,
    shop: "AmiAmi",
    shippingFee,
    taxes: 0,
    duties: 0,
    tariffs: 0,
    miscFees: 0,
  }) as EditedOrder;

describe("an Order write on the orders page", () => {
  test("an unfiltered delete hides the Order before the server answers", async () => {
    const orders = renderOrdersPage({});
    await loaded();
    const readsBeforeWrite = server.listReads;

    const deleting = orders.act((actions) => actions.handleDeleteOrders(new Set([BRAVO.orderId])));
    await waitFor(() =>
      expect(shown()).toEqual({ count: "2", orders: ["Alpha 1000", "Charlie 200"] }),
    );

    await answer(0, "finish");
    expect(await deleting).toBe("resolved");
    await waitFor(() => expect(server.listReads).toBe(readsBeforeWrite + 1));
    expect({ shown: shown(), toasts: toastTitles() }).toEqual({
      shown: { count: "2", orders: ["Alpha 1000", "Charlie 200"] },
      toasts: ["success: Order deleted"],
    });
  });

  test("a filtered delete marks the Order as saving until the server answers", async () => {
    const orders = renderOrdersPage({ shop: ["AmiAmi"] });
    await loaded();

    const deleting = orders.act((actions) => actions.handleDeleteOrders(new Set([BRAVO.orderId])));
    await waitFor(() => expect(server.writes).toHaveLength(1));
    await waitFor(() =>
      expect(shown()).toEqual({
        count: "3",
        orders: ["Alpha 1000", "Bravo 500 saving", "Charlie 200"],
      }),
    );
    expect(toastTitles()).toEqual(["loading: Deleting orders..."]);

    await answer(0, "finish");
    expect(await deleting).toBe("resolved");
    await waitFor(() =>
      expect(shown()).toEqual({ count: "2", orders: ["Alpha 1000", "Charlie 200"] }),
    );
    expect({ toasts: toastTitles(), closed: toastClose.mock.calls.length }).toEqual({
      toasts: ["loading: Deleting orders...", "success: Order deleted"],
      closed: 1,
    });
  });

  test("a failed edit puts the Order back, says so and refetches the list", async () => {
    const orders = renderOrdersPage({});
    await loaded();
    const readsBeforeWrite = server.listReads;

    const editing = orders.act((actions) => actions.handleEditOrder(alphaWithShippingFee(300), []));
    await waitFor(() => expect(shown().orders).toEqual(["Alpha 1200", "Bravo 500", "Charlie 200"]));

    const releaseReads = holdListReads();
    await answer(0, "fail");
    await waitFor(() =>
      expect(shown()).toEqual({
        count: "3",
        orders: ["Alpha 1000", "Bravo 500", "Charlie 200"],
      }),
    );
    expect(server.listReads).toBe(readsBeforeWrite + 1);
    await releaseReads();
    expect({ settled: await editing, toasts: toastTitles() }).toEqual({
      settled: "rejected",
      toasts: ["error: Failed to update order. Please try again."],
    });
  });

  test("an edit that fails while a delete of the same Order is saving shows the Order until the delete lands", async () => {
    const orders = renderOrdersPage({});
    await loaded();

    const editing = orders.act((actions) => actions.handleEditOrder(alphaWithShippingFee(300), []));
    await waitFor(() =>
      expect(shown()).toEqual({
        count: "3",
        orders: ["Alpha 1200", "Bravo 500", "Charlie 200"],
      }),
    );

    const deleting = orders.act((actions) => actions.handleDeleteOrders(new Set([ALPHA.orderId])));
    await waitFor(() =>
      expect(shown()).toEqual({ count: "2", orders: ["Bravo 500", "Charlie 200"] }),
    );

    await answer(0, "fail");
    expect(await editing).toBe("rejected");
    await waitFor(() =>
      expect(shown()).toEqual({
        count: "3",
        orders: ["Alpha 1000", "Bravo 500", "Charlie 200"],
      }),
    );

    await answer(1, "finish");
    expect(await deleting).toBe("resolved");
    await waitFor(() =>
      expect(shown()).toEqual({ count: "2", orders: ["Bravo 500", "Charlie 200"] }),
    );
    expect(toastTitles()).toEqual([
      "error: Failed to update order. Please try again.",
      "success: Order deleted",
    ]);
  });
});

describe("a failed Order write after the filter changes", () => {
  test("leaves the new list as the server sent it", async () => {
    const orders = renderOrdersPage({});
    await loaded();

    const deleting = orders.act((actions) => actions.handleDeleteOrders(new Set([BRAVO.orderId])));
    await waitFor(() =>
      expect(shown()).toEqual({ count: "2", orders: ["Alpha 1000", "Charlie 200"] }),
    );
    await orders.filterTo({ search: "Alpha" });
    await waitFor(() => expect(shown()).toEqual({ count: "1", orders: ["Alpha 1000"] }));

    const releaseReads = holdListReads();
    await answer(0, "fail");
    await waitFor(() =>
      expect(toastTitles()).toContain("error: Failed to delete order(s). Please try again."),
    );
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );
    expect(shown()).toEqual({ count: "1", orders: ["Alpha 1000"] });

    await releaseReads();
    expect(await deleting).toBe("rejected");
  });
});
