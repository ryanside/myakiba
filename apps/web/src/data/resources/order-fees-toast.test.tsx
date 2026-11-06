import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EditedOrder } from "@myakiba/contracts/orders/schema";
import { PopoverMultiInputCell } from "@/components/cells/popover-multi-input-cell";
import { toast } from "@/components/ui/toast";
import { orThrow, useResourceMutation } from "../client";
import { editOrderCommand } from "./orders";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const order: EditedOrder = {
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

async function saveFeesAndReadToast(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  try {
    render(
      <QueryClientProvider client={queryClient}>
        <FeesCell />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "$10.00" }));
    fireEvent.change(await screen.findByLabelText("Shipping"), { target: { value: "2.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(added.mock.calls).toHaveLength(2));
    return added.mock.calls.map(([options]) => options);
  } finally {
    added.mockRestore();
    queryClient.clear();
  }
}

describe("a failed Fees & Charges save", () => {
  test("shows the server's message when the order no longer exists", async () => {
    const toasts = await saveFeesAndReadToast(
      async () => new Response("Order not found", { status: 404 }),
    );

    expect(toasts).toContainEqual({ type: "error", title: "Order not found" });
  });

  test("keeps the fallback when the server answers 503", async () => {
    const toasts = await saveFeesAndReadToast(
      async () => new Response("Internal failure", { status: 503 }),
    );

    expect(toasts).toContainEqual({ type: "error", title: "Failed to edit order" });
  });

  test("keeps the fallback when the server cannot be reached", async () => {
    const toasts = await saveFeesAndReadToast(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(toasts).toContainEqual({ type: "error", title: "Failed to edit order" });
  });
});
