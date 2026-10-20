import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";

type Write = { readonly name: string; finish: () => void; fail: () => void };
const server = { inFlight: [] as Write[], finished: [] as string[] };

const write =
  (name: string) =>
  (..._args: unknown[]): Promise<void> =>
    new Promise((resolve, reject) => {
      server.inFlight.push({
        name,
        finish: () => {
          server.finished.push(name);
          resolve();
        },
        fail: () => reject(new Error(`${name} rejected by server`)),
      });
    });

await mock.module("@/queries/orders", () => ({
  getOrders: async () => [],
  getOrder: async () => {
    throw new Error("no order page in these tests");
  },
  getOrderItems: async () => ({ items: [], totalCount: 0 }),
  getOrderItemReleases: async () => [],
  mergeOrders: write("merge"),
  splitOrders: write("split"),
  editOrder: write("edit order"),
  deleteOrders: write("delete orders"),
  deleteOrderItem: write("delete item"),
  deleteOrderItems: write("delete items"),
  moveItem: write("move items"),
}));
await mock.module("@/queries/collection", () => ({ updateCollectionItem: write("edit item") }));

const { useOrdersMutations } = await import("./use-orders");

afterEach(() => {
  cleanup();
  server.inFlight.length = 0;
  server.finished.length = 0;
});

function renderOrdersPage(filters: OrderFilters) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useOrdersMutations({ filters }), { wrapper }).result;
}

const newOrder = { title: "Merged", shop: "AmiAmi" } as never;
const cascade = [] as never;
const ids = new Set(["a", "b"]);

type Handlers = ReturnType<typeof useOrdersMutations>;
const HANDLERS: readonly (readonly [string, (h: Handlers) => Promise<void>])[] = [
  ["handleMerge", (h) => h.handleMerge(newOrder, cascade, ids)],
  ["handleSplit", (h) => h.handleSplit(newOrder, cascade, ids)],
  ["handleDeleteItems", (h) => h.handleDeleteItems(ids)],
  ["handleMoveItem", (h) => h.handleMoveItem("target", ids)],
  ["handleDeleteOrders", (h) => h.handleDeleteOrders(ids)],
  ["handleEditOrder", (h) => h.handleEditOrder({ orderId: "a" } as never, cascade)],
  ["handleEditItem", (h) => h.handleEditItem({ id: "a" } as never)],
  ["handleDeleteItem", (h) => h.handleDeleteItem("order", "a")],
];

const LISTS: readonly (readonly [string, OrderFilters])[] = [
  ["unfiltered list", {}],
  ["filtered list", { shop: ["AmiAmi"] }],
];

const settle = (ms: number) =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  );

function serverWrite(): Write {
  const [pending] = server.inFlight;
  if (!pending) throw new Error("no write reached the server");
  return pending;
}

describe.each(LISTS)(
  "an order action's promise settles after the server write (%s)",
  (_list, filters) => {
    test.each(HANDLERS)("%s: the caller's await waits for the write", async (_name, run) => {
      const handlers = renderOrdersPage(filters);
      let callerResumed = false;
      const call = run(handlers.current).then(() => {
        callerResumed = true;
      });
      await waitFor(() => expect(server.inFlight).toHaveLength(1));
      await settle(100);

      expect({
        callerResumedBeforeWriteFinished: callerResumed,
        finished: server.finished,
      }).toEqual({
        callerResumedBeforeWriteFinished: false,
        finished: [],
      });
      await act(async () => serverWrite().finish());
      await call;
      expect(callerResumed).toBe(true);
    });

    test.each(HANDLERS)("%s: a rejected write rejects the caller's await", async (_name, run) => {
      const handlers = renderOrdersPage(filters);
      const call = run(handlers.current).then(
        () => "resolved",
        () => "rejected",
      );
      await waitFor(() => expect(server.inFlight).toHaveLength(1));
      await act(async () => serverWrite().fail());

      expect(await call).toBe("rejected");
    });
  },
);
