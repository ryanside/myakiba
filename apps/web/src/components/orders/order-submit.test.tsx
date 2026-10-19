import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react/pure";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Order } from "@myakiba/contracts/orders/types";

await mock.module("@/queries/search", () => ({
  searchOrders: async () => ({ orderIdsAndTitles: [{ id: "od-target", title: "Target Order" }] }),
}));

const { OrderForm } = await import("./order-form");
const { default: UnifiedItemMoveForm } = await import("./unified-item-move-form");

const settle = () =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 50);
      }),
  );

type HeldWrite = {
  readonly send: (...args: unknown[]) => Promise<void>;
  readonly calls: () => number;
  readonly finish: () => Promise<void>;
  readonly fail: () => Promise<void>;
};

function heldWrite(): HeldWrite {
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const answer = async (respond: (write: (typeof pending)[number]) => void) => {
    const [write] = pending;
    if (!write) throw new Error("no write reached the server");
    respond(write);
    await settle();
  };
  return {
    send: () =>
      new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
    calls: () => pending.length,
    finish: () => answer((write) => write.resolve()),
    fail: () => answer((write) => write.reject(new Error("write rejected by server"))),
  };
}

// A submit path that drops its await turns a failed write into an unhandled rejection. bun
// fails the test on it and starts teardown while the test body is still running. Cleanup waits
// for the body to signal that it finished, so the body never asserts against an unmounted form.
let bodyDone: Promise<void> = Promise.resolve();
const BODY_FALLBACK_MS = 4000;

function untilBodyDone(body: () => Promise<void>) {
  return async () => {
    let signalDone = () => {};
    bodyDone = new Promise((resolve) => {
      signalDone = resolve;
    });
    try {
      await body();
    } finally {
      signalDone();
    }
  };
}

afterEach(async () => {
  await Promise.race([
    bodyDone,
    new Promise((resolve) => {
      setTimeout(resolve, BODY_FALLBACK_MS);
    }),
  ]);
  cleanup();
});

const order: Order = {
  orderId: "od-alpha",
  title: "Alpha Order",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "n/a",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Ordered",
  total: 0,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 2,
  images: [],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};
const ids = new Set(["a", "b"]);

type SubmitPath = {
  readonly name: string;
  readonly render: (write: HeldWrite, clearSelections: () => void) => ReactElement;
  readonly submit: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
  readonly clearsSelection: boolean;
};

const trigger = <button type="button">Open</button>;
const clickSubmit = (name: string) => async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name }));
};

const SUBMIT_PATHS: SubmitPath[] = [
  {
    name: "edit-order sheet",
    render: (write) => (
      <OrderForm
        type="edit-order"
        renderTrigger={trigger}
        orderData={order}
        callbackFn={write.send}
        currency="USD"
      />
    ),
    submit: clickSubmit("Update"),
    clearsSelection: false,
  },
  {
    name: "merge dialog",
    render: (write, clearSelections) => (
      <OrderForm
        type="merge"
        renderTrigger={trigger}
        orderIds={ids}
        callbackFn={write.send}
        clearSelections={clearSelections}
        currency="USD"
      />
    ),
    submit: clickSubmit("Merge"),
    clearsSelection: true,
  },
  {
    name: "move to an existing order",
    render: (write, clearSelections) => (
      <UnifiedItemMoveForm
        renderTrigger={trigger}
        selectedItems={{ collectionIds: ids, orderIds: new Set(["od-alpha"]) }}
        onMoveToExisting={(...args) => write.send(...args)}
        onMoveToNew={async () => {}}
        clearSelections={clearSelections}
        currency="USD"
      />
    ),
    submit: async (user) => {
      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByPlaceholderText("Search orders by title..."), "Target");
      await user.click(await screen.findByText("Target Order"));
      await user.click(screen.getByRole("button", { name: "Move Items" }));
    },
    clearsSelection: true,
  },
  {
    name: "move to a new order",
    render: (write, clearSelections) => (
      <UnifiedItemMoveForm
        renderTrigger={trigger}
        selectedItems={{ collectionIds: ids, orderIds: new Set(["od-alpha"]) }}
        onMoveToExisting={async () => {}}
        onMoveToNew={(...args) => write.send(...args)}
        clearSelections={clearSelections}
        currency="USD"
      />
    ),
    submit: async (user) => {
      await user.click(screen.getByRole("radio", { name: "New Order" }));
      await user.click(screen.getByRole("button", { name: "Move to New Order" }));
    },
    clearsSelection: true,
  },
];

async function openAndSubmit(path: SubmitPath) {
  const write = heldWrite();
  const clearSelections = mock(() => {});
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      {path.render(write, clearSelections)}
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await path.submit(user);
  await waitFor(() => expect(write.calls()).toBe(1));
  return { write, clearSelections };
}

const formIsOpen = () => screen.queryByRole("dialog") !== null;

describe.each(SUBMIT_PATHS)("$name submit", (path) => {
  test(
    "stays open while the write is pending and closes after it succeeds",
    untilBodyDone(async () => {
      const { write, clearSelections } = await openAndSubmit(path);
      await settle();

      expect({ open: formIsOpen(), cleared: clearSelections.mock.calls.length }).toEqual({
        open: true,
        cleared: 0,
      });

      await write.finish();
      await waitFor(() => expect(formIsOpen()).toBe(false));
      expect(clearSelections.mock.calls.length).toBe(path.clearsSelection ? 1 : 0);
    }),
  );

  test(
    "stays open with the selection kept and no unhandled rejection after the write fails",
    untilBodyDone(async () => {
      const { write, clearSelections } = await openAndSubmit(path);

      await write.fail();

      expect({ open: formIsOpen(), cleared: clearSelections.mock.calls.length }).toEqual({
        open: true,
        cleared: 0,
      });
    }),
  );
});
