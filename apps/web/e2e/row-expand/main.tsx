import "@fontsource-variable/inter/opsz.css";
import "./row-expand.css";
import type { Order } from "@myakiba/contracts/orders/types";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ExpandedState } from "@tanstack/react-table";
import { Result } from "better-result";
import { MotionGlobalConfig } from "motion/react";
import { useState } from "react";
import ReactDOM from "react-dom/client";
import { createOrdersColumns, OrderItemSelectionContext } from "@/components/orders/orders-columns";
import { OrderPendingContext } from "@/components/orders/order-pending-context";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createQueryClient } from "@/data/client";

MotionGlobalConfig.skipAnimations = true;
document.documentElement.classList.add("dark");

Object.defineProperty(window, "fetch", {
  value: async () => Response.json({ message: "Not in this harness" }, { status: 404 }),
});

const saved = async () => Result.ok();
// An expanded row's items grid reads the app's routes, which this harness has none of.
const COLUMNS = createOrdersColumns({
  onEditOrder: saved,
  onSetPaid: saved,
  onDeleteOrders: saved,
  onEditItem: saved,
  onDeleteItem: saved,
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
}).map((column) =>
  column.id === "expand"
    ? { ...column, meta: { ...column.meta, expandedContent: () => <p>Order items</p> } }
    : column,
);

const ORDERS: Order[] = ["August Figure Preorder", "June Plush Order"].map((title, index) => ({
  orderId: `order000000${index}`,
  title,
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "EMS",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Ordered",
  paid: false,
  total: 12_999,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 1,
  images: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
}));

const PENDING = { isOrderPending: () => false, isCollectionItemPending: () => false };
const ITEM_SELECTION = {
  selectedOrderIdByCollectionId: new Map<string, string>(),
  setSelectedOrderIdByCollectionId: () => {},
};

/** The Orders table as `OrdersDataGrid` lays it out in its compact and table views. */
function OrdersTable({ dense }: { readonly dense: boolean }) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const table = useReactTable({
    columns: COLUMNS,
    data: ORDERS,
    getRowId: (row) => row.orderId,
    getRowCanExpand: () => true,
    state: { expanded },
    onExpandedChange: setExpanded,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <section aria-label={dense ? "Compact" : "Table"}>
      <DataGrid
        table={table}
        recordCount={ORDERS.length}
        tableLayout={{
          dense,
          columnsPinnable: true,
          columnsResizable: true,
          columnsMovable: true,
          columnsVisibility: true,
        }}
      >
        <DataGridContainer>
          <ScrollArea>
            <DataGridTable />
          </ScrollArea>
        </DataGridContainer>
      </DataGrid>
    </section>
  );
}

function Page() {
  return (
    <OrderPendingContext value={PENDING}>
      <OrderItemSelectionContext value={ITEM_SELECTION}>
        <main className="flex w-full flex-col gap-10 px-4 py-10">
          <OrdersTable dense={true} />
          <OrdersTable dense={false} />
        </main>
      </OrderItemSelectionContext>
    </OrderPendingContext>
  );
}

const router = createRouter({
  routeTree: createRootRoute({ component: Page }),
  history: createMemoryHistory(),
});

const root = document.querySelector("#app");
if (!root) throw new Error("The harness has no #app");
ReactDOM.createRoot(root).render(
  <QueryClientProvider client={createQueryClient()}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
