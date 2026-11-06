import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EditedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { PopoverMultiInputCell } from "@/components/cells/popover-multi-input-cell";
import { OrderActionsCell } from "@/components/orders/order-row-cells";
import { toast } from "@/components/ui/toast";
import { orThrow, useResourceMutation } from "../client";
import { editOrderCommand } from "./orders";

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

function FeesCell() {
  const mutation = useResourceMutation(editOrderCommand);
  return (
    <PopoverMultiInputCell
      title="Fees & Charges"
      inputs={[{ title: "Shipping", name: "shippingFee", type: "currency", value: 100 }]}
      totalAmount={1000}
      currency="USD"
      locale="en-US"
      onSubmit={async (fees) => {
        await orThrow(
          mutation.run({ values: { ...order, ...fees }, cascadeOptions: [], list: {} }),
        );
      }}
    />
  );
}

function EditOrderDialog() {
  const mutation = useResourceMutation(editOrderCommand);
  return (
    <OrderActionsCell
      order={order}
      isPending={mutation.isPending}
      currency="USD"
      onEditOrder={async (values: EditedOrder, cascadeOptions) => {
        await orThrow(mutation.run({ values, cascadeOptions, list: {} }));
      }}
      onDeleteOrders={async () => {}}
    />
  );
}

async function saveAndReadToasts(surface: "fees" | "dialog", respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  try {
    render(
      <QueryClientProvider client={queryClient}>
        {surface === "fees" ? <FeesCell /> : <EditOrderDialog />}
      </QueryClientProvider>,
    );
    if (surface === "fees") {
      fireEvent.click(screen.getByRole("button", { name: "$10.00" }));
      fireEvent.change(await screen.findByLabelText("Shipping"), { target: { value: "2.50" } });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
      fireEvent.change(await screen.findByLabelText("Title"), {
        target: { value: "Edited order" },
      });
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: surface === "fees" ? "Save" : "Update" }));
    });
    await waitFor(() => expect(added.mock.calls.length).toBeGreaterThan(0));
    if (surface === "fees") {
      expect(screen.getByRole("button", { name: "$10.00" })).toBeDefined();
    } else {
      expect(screen.getByRole("dialog")).toBeDefined();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Update" }).getAttribute("aria-busy")).toBeNull(),
      );
    }
    return added.mock.calls.map(([options]) => options);
  } finally {
    added.mockRestore();
    queryClient.clear();
  }
}

describe.each(["fees", "dialog"] as const)("a failed order edit from %s", (surface) => {
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
