import { afterEach, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DashboardKanbanOrder } from "@/queries/dashboard";
import { cardsIn, drag, frame, stopDrags, stubKanbanLayout } from "../../../test/kanban-drag";

type Write = {
  readonly orderId: string;
  readonly change: Readonly<Record<string, string | null>>;
  readonly settle: () => void;
  readonly fail: () => void;
};
const writes: Write[] = [];
let server: readonly DashboardKanbanOrder[] = [];
let queryClient = new QueryClient();
let heldFetches: Promise<unknown> = Promise.resolve();

async function idle() {
  await waitFor(() => expect(queryClient.isFetching({ queryKey: ["dashboard"] })).toBe(0), {
    timeout: 10_000,
  });
  await frame();
}

const holdFetches = () => {
  const { promise, resolve } = Promise.withResolvers<null>();
  heldFetches = promise;
  return async () => {
    resolve(null);
    await idle();
  };
};

const sendWrite = (orderId: string, change: Write["change"]) =>
  new Promise<void>((resolve, reject) => {
    writes.push({ orderId, change, settle: resolve, fail: () => reject(new Error("offline")) });
  });

const realOrders = await import("@/queries/orders");
await mock.module("@/queries/orders", () => ({
  ...realOrders,
  updateOrderStatus: (orderId: string, status: string) => sendWrite(orderId, { status }),
  updateOrderDate: (orderId: string, field: string, date: string | null) =>
    sendWrite(orderId, { [field]: date }),
}));
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { children: ReactNode }) => <a href="#order">{children}</a>,
}));

const { default: OrderKanban } = await import("./order-kanban");

setDefaultTimeout(30_000);

beforeAll(() => {
  stubKanbanLayout(() => 100);
  const measure = HTMLElement.prototype.getBoundingClientRect;
  // Before the pointer-first collision strategy, a drop landed only where dnd-kit's fixed drag
  // overlay overlapped a column, and a browser lays that overlay out at its inline box.
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
    const { position, left, top, width, height } = this.style;
    if (position !== "fixed" || !width || !height) return measure.call(this);
    return DOMRect.fromRect({
      x: Number.parseFloat(left),
      y: Number.parseFloat(top),
      width: Number.parseFloat(width),
      height: Number.parseFloat(height),
    });
  };
});

afterEach(async () => {
  await stopDrags();
  cleanup();
  writes.length = 0;
  server = [];
  heldFetches = Promise.resolve();
});

const order = (
  orderId: string,
  status: DashboardKanbanOrder["status"],
  fields: Partial<DashboardKanbanOrder> = {},
): DashboardKanbanOrder => ({
  orderId,
  title: `${orderId} preorder`,
  status,
  shop: "AmiAmi",
  total: 1000,
  itemImages: [],
  itemIds: [],
  releaseDate: null,
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  ...fields,
});

function Dashboard() {
  const { data, isPending, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      await heldFetches;
      return structuredClone(server);
    },
  });
  return (
    <OrderKanban
      orders={data ?? []}
      ordersUpdatedAt={dataUpdatedAt}
      isLoading={isPending}
      currency="USD"
      dateFormat="MM/DD/YYYY"
    />
  );
}

async function renderBoard(orders: readonly DashboardKanbanOrder[]) {
  server = orders;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
  await idle();
}

const card = (orderId: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-slot="kanban-item"][data-value="${orderId}"]`,
  );
  if (!element) throw new Error(`no card for ${orderId}`);
  return element;
};

const handleOf = (orderId: string) => {
  const handle = card(orderId).querySelector('[data-slot="kanban-item-handle"]');
  if (!handle) throw new Error(`no drag handle for ${orderId}`);
  return handle;
};

const board = () => ({
  Ordered: cardsIn("Ordered"),
  Paid: cardsIn("Paid"),
  Shipped: cardsIn("Shipped"),
  Owned: cardsIn("Owned"),
});

const shownDate = (orderId: string, label: string) =>
  within(card(orderId)).getByText(label).nextElementSibling?.textContent;

const sentWrites = () => writes.map(({ orderId, change }) => ({ orderId, change }));

async function settle(write: Write | undefined, outcome: "settle" | "fail" = "settle") {
  if (!write) throw new Error("no write in flight");
  if (outcome === "settle") {
    server = server.map((candidate) =>
      candidate.orderId === write.orderId ? { ...candidate, ...write.change } : candidate,
    );
  }
  await act(async () => write[outcome]());
  await frame();
}

async function pickPaymentDate(orderId: string, dayLabel: RegExp) {
  const user = userEvent.setup();
  await user.click(within(card(orderId)).getByText("Paid"));
  await user.click(screen.getByRole("button", { name: dayLabel }));
}

describe("a failed dashboard kanban write rolls back only its own change", () => {
  test("a failed status write returns its card and keeps another card's move that is still in flight", async () => {
    await renderBoard([order("miku", "Ordered"), order("luka", "Ordered"), order("rin", "Paid")]);

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    await drag(handleOf("luka"), { x: 100, y: 10 }, { x: 700, y: 50 });
    const releaseFetches = holdFetches();
    await settle(writes[0], "fail");
    const afterFailure = board();
    await settle(writes[1]);
    await releaseFetches();

    expect({ sent: sentWrites(), afterFailure, afterRefetch: board() }).toEqual({
      sent: [
        { orderId: "miku", change: { status: "Paid" } },
        { orderId: "luka", change: { status: "Shipped" } },
      ],
      afterFailure: { Ordered: ["miku"], Paid: ["rin"], Shipped: ["luka"], Owned: [] },
      afterRefetch: { Ordered: ["miku"], Paid: ["rin"], Shipped: ["luka"], Owned: [] },
    });
  });

  test("a failed date write restores its date and keeps another card's move that is still in flight", async () => {
    await renderBoard([
      order("miku", "Ordered"),
      order("rin", "Paid", { paymentDate: "2026-03-10" }),
    ]);

    await pickPaymentDate("rin", /March 20th, 2026/);
    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 700, y: 50 });
    const releaseFetches = holdFetches();
    await settle(writes[0], "fail");
    const afterFailure = { board: board(), paid: shownDate("rin", "Paid") };
    await settle(writes[1]);
    await releaseFetches();

    expect({
      sent: sentWrites(),
      afterFailure,
      afterRefetch: { board: board(), paid: shownDate("rin", "Paid") },
    }).toEqual({
      sent: [
        { orderId: "rin", change: { paymentDate: "2026-03-20" } },
        { orderId: "miku", change: { status: "Shipped" } },
      ],
      afterFailure: {
        board: { Ordered: [], Paid: ["rin"], Shipped: ["miku"], Owned: [] },
        paid: "03/10/2026",
      },
      afterRefetch: {
        board: { Ordered: [], Paid: ["rin"], Shipped: ["miku"], Owned: [] },
        paid: "03/10/2026",
      },
    });
  });
});
