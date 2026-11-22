import { afterEach, expect, test } from "bun:test";
import { Result } from "better-result";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { Order } from "@myakiba/contracts/orders/types";
import { OrdersCardGrid } from "./orders-card-grid";
import { OrderPendingContext } from "./order-pending-context";

afterEach(cleanup);

const order: Order = {
  orderId: "order",
  title: "AmiAmi preorder",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "n/a",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Ordered",
  paid: false,
  payment: "unpaid",
  total: 0,
  unpaidCosts: 0,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 1,
  images: [],
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
};

async function renderCards(orders: readonly Order[]) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <OrdersCardGrid
          orders={orders}
          cardWidth={280}
          rowSelection={{}}
          onRowSelectionChange={() => {}}
          onEditOrder={async () => Result.ok()}
          onDeleteOrders={async () => Result.ok()}
          currency="USD"
          locale="en-US"
          isLoading={false}
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderPendingContext
        value={{ isOrderPending: () => false, isCollectionItemPending: () => false }}
      >
        <RouterProvider router={router} />
      </OrderPendingContext>
    </QueryClientProvider>,
  );
}

async function shownUnpaidCosts(shown: Order) {
  await renderCards([shown]);
  const amount = screen.queryByText("Unpaid Costs")?.nextElementSibling?.textContent ?? null;
  cleanup();
  return amount;
}

test("a Partly paid card shows its Unpaid Costs, and an unpaid card, whose total is what it owes, does not", async () => {
  expect({
    partly: await shownUnpaidCosts({
      ...order,
      paid: true,
      payment: "partly",
      total: 3000,
      unpaidCosts: 1200,
    }),
    unpaid: await shownUnpaidCosts({ ...order, total: 3000, unpaidCosts: 3000 }),
    paid: await shownUnpaidCosts({
      ...order,
      paid: true,
      payment: "paid",
      total: 3000,
      unpaidCosts: 0,
    }),
  }).toEqual({ partly: "$12.00", unpaid: null, paid: null });
});
