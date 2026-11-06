import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { useMemo } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Order } from "@myakiba/contracts/orders/types";
import { createOrdersColumns } from "@/components/orders/orders-columns";
import { toast } from "@/components/ui/toast";
import { useOrdersMutations } from "@/hooks/use-orders";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const order: Order = {
  orderId: "od-deleted",
  title: "Deleted order",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "n/a",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Ordered",
  shippingFee: 100,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  total: 1000,
  itemCount: 1,
  images: [],
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
};

const rows = [order];

function OrdersTableCell({ column }: { readonly column: string }) {
  const {
    handleEditOrder,
    handleDeleteOrders,
    handleEditItem,
    handleDeleteItem,
    isOrderPending,
    isCollectionItemPending,
  } = useOrdersMutations();
  const columns = useMemo(
    () =>
      createOrdersColumns({
        onEditOrder: handleEditOrder,
        onDeleteOrders: handleDeleteOrders,
        onEditItem: handleEditItem,
        onDeleteItem: handleDeleteItem,
        isOrderPending,
        isCollectionItemPending,
        currency: "USD",
        locale: "en-US",
        dateFormat: "MM/DD/YYYY",
      }),
    [
      handleEditOrder,
      handleDeleteOrders,
      handleEditItem,
      handleDeleteItem,
      isOrderPending,
      isCollectionItemPending,
    ],
  );
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const cell = table
    .getRowModel()
    .rows.at(0)
    ?.getAllCells()
    .find((candidate) => candidate.column.id === column);
  if (!cell) {
    throw new Error(`orders table has no ${column} cell`);
  }
  return flexRender(cell.column.columnDef.cell, cell.getContext());
}

const surfaces = [
  {
    name: "fees",
    column: "total",
    submitLabel: "Save",
    edit: async () => {
      fireEvent.click(screen.getByRole("button", { name: "$10.00" }));
      fireEvent.change(await screen.findByLabelText("Shipping"), { target: { value: "2.50" } });
    },
    settled: async () => {
      expect(screen.getByRole("button", { name: "$10.00" })).toBeDefined();
    },
  },
  {
    name: "dialog",
    column: "actions",
    submitLabel: "Update",
    edit: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
      fireEvent.change(await screen.findByLabelText("Title"), {
        target: { value: "Edited order" },
      });
    },
    settled: async () => {
      expect(screen.getByRole("dialog")).toBeDefined();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Update" }).getAttribute("aria-busy")).toBeNull(),
      );
    },
  },
] as const;

type Surface = (typeof surfaces)[number];

async function saveAndReadToasts(surface: Surface, respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  try {
    render(
      <QueryClientProvider client={queryClient}>
        <OrdersTableCell column={surface.column} />
      </QueryClientProvider>,
    );
    await surface.edit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: surface.submitLabel }));
    });
    await waitFor(() => expect(added.mock.calls.length).toBeGreaterThan(0));
    await surface.settled();
    return added.mock.calls.map(([options]) => options);
  } finally {
    added.mockRestore();
    queryClient.clear();
  }
}

describe.each(surfaces)("a failed order edit from $name", (surface) => {
  test("shows the server's message when the order no longer exists", async () => {
    const toasts = await saveAndReadToasts(
      surface,
      async () => new Response("Order not found", { status: 404 }),
    );

    expect(toasts).toEqual([{ type: "error", title: "Order not found" }]);
  });

  test("keeps the fallback when the server answers 503", async () => {
    const toasts = await saveAndReadToasts(
      surface,
      async () => new Response("Internal failure", { status: 503 }),
    );

    expect(toasts).toEqual([{ type: "error", title: "Failed to update order. Please try again." }]);
  });

  test("keeps the fallback when the server cannot be reached", async () => {
    const toasts = await saveAndReadToasts(surface, async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(toasts).toEqual([{ type: "error", title: "Failed to update order. Please try again." }]);
  });
});
