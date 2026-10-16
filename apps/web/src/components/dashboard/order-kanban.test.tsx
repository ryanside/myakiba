import { afterEach, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DashboardKanbanOrder } from "@/queries/dashboard";
import {
  cardsIn,
  drag,
  frame,
  startDrag,
  stopDrags,
  stubKanbanLayout,
} from "../../../test/kanban-drag";

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
let fetchesHeld = false;

async function idle() {
  await waitFor(() => expect(queryClient.isFetching({ queryKey: ["dashboard"] })).toBe(0), {
    timeout: 10_000,
  });
  await frame();
}

const holdFetches = () => {
  const { promise, resolve } = Promise.withResolvers<null>();
  heldFetches = promise;
  fetchesHeld = true;
  return async () => {
    fetchesHeld = false;
    resolve(null);
    await idle();
  };
};

const sendWrite = (orderId: string, change: Write["change"]) =>
  new Promise<void>((resolve, reject) => {
    writes.push({ orderId, change, settle: resolve, fail: () => reject(new Error("offline")) });
  });

const realOrders = await import("@/queries/orders");
mock.module("@/queries/orders", () => ({
  ...realOrders,
  updateOrderStatus: (orderId: string, status: string) => sendWrite(orderId, { status }),
  updateOrderDate: (orderId: string, field: string, date: string | null) =>
    sendWrite(orderId, { [field]: date }),
}));
const realDashboard = await import("@/queries/dashboard");
mock.module("@/queries/dashboard", () => ({
  ...realDashboard,
  getReleaseCalendar: () => new Promise(() => {}),
}));
const realRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { children: ReactNode }) => <a href="#order">{children}</a>,
}));

const { default: OrderKanban } = await import("./order-kanban");
const { MonthlyTab } = await import("./monthly-tab");

setDefaultTimeout(30_000);

beforeAll(() => stubKanbanLayout(() => 100));

afterEach(async () => {
  await stopDrags();
  cleanup();
  writes.length = 0;
  server = [];
  heldFetches = Promise.resolve();
  fetchesHeld = false;
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

function MonthlyDashboard({ month }: { readonly month: number }) {
  const { data, isPending, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard", "monthly", month, 2026],
    queryFn: async () => {
      await heldFetches;
      return {
        itemCount: 0,
        orderCount: 0,
        unpaidOrderCount: 0,
        paidAmount: 0,
        unpaidAmount: 0,
        shopBreakdown: [],
        costBreakdown: { items: 0, shipping: 0, taxes: 0, duties: 0, tariffs: 0, miscFees: 0 },
        orders: structuredClone(
          server.filter((candidate) =>
            candidate.releaseDate?.startsWith(`2026-${String(month).padStart(2, "0")}`),
          ),
        ),
      };
    },
  });
  return (
    <MonthlyTab
      data={data}
      dataUpdatedAt={dataUpdatedAt}
      isLoading={isPending}
      isError={false}
      error={null}
      currency="USD"
      locale="en-US"
      dateFormat="MM/DD/YYYY"
      month={month}
      year={2026}
    />
  );
}

async function renderBoard(orders: readonly DashboardKanbanOrder[], month?: number) {
  server = orders;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  const ui = (shownMonth?: number) => (
    <QueryClientProvider client={queryClient}>
      {shownMonth === undefined ? <Dashboard /> : <MonthlyDashboard month={shownMonth} />}
    </QueryClientProvider>
  );
  const view = render(ui(month));
  await idle();
  return {
    showMonth: async (nextMonth: number) => {
      view.rerender(ui(nextMonth));
      await idle();
    },
    refetchLands: async (next: readonly DashboardKanbanOrder[]) => {
      server = next;
      await act(() => queryClient.refetchQueries({ queryKey: ["dashboard"] }));
      await frame();
    },
  };
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

function watchColumnsOf(orderId: string) {
  const columns = new Set<string>();
  const record = (records: MutationRecord[]) => {
    for (const { target, addedNodes } of records) {
      for (const node of addedNodes) {
        if (node instanceof HTMLElement && node.dataset.value === orderId) {
          const column = (target as HTMLElement).closest<HTMLElement>(
            '[data-slot="kanban-column"]',
          );
          if (column?.dataset.value) columns.add(column.dataset.value);
        }
      }
    }
  };
  const observer = new MutationObserver(record);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    record(observer.takeRecords());
    observer.disconnect();
    return [...columns];
  };
}

const sentWrites = () => writes.map(({ orderId, change }) => ({ orderId, change }));

const shownTitle = (orderId: string) => within(card(orderId)).getByRole("link").textContent;

const shownDate = (orderId: string, label: string) =>
  within(card(orderId)).getByText(label).nextElementSibling?.textContent;

async function settle(write: Write | undefined, outcome: "settle" | "fail" = "settle") {
  if (!write) throw new Error("no write in flight");
  if (outcome === "settle") {
    server = server.map((candidate) =>
      candidate.orderId === write.orderId ? { ...candidate, ...write.change } : candidate,
    );
  }
  await act(async () => write[outcome]());
  await (fetchesHeld ? frame() : idle());
}

async function pickPaymentDate(orderId: string, dayLabel: RegExp) {
  const user = userEvent.setup();
  await user.click(within(card(orderId)).getByText("Paid"));
  await user.click(screen.getByRole("button", { name: dayLabel }));
}

describe("a dashboard kanban card keeps the user's change while its write is in flight", () => {
  test("a moved card stays in its new column when a refetch lands mid-write, then follows the server", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    expect(sentWrites()).toEqual([{ orderId: "miku", change: { status: "Paid" } }]);

    await refetchLands([order("miku", "Ordered"), order("rin", "Shipped")]);
    const midWrite = board();
    await settle(writes[0]);
    const afterWrite = board();
    await refetchLands([order("miku", "Shipped"), order("rin", "Shipped")]);
    const afterServerMove = board();

    expect({ midWrite, afterWrite, afterServerMove }).toEqual({
      midWrite: { Ordered: [], Paid: ["miku"], Shipped: ["rin"], Owned: [] },
      afterWrite: { Ordered: [], Paid: ["miku"], Shipped: ["rin"], Owned: [] },
      afterServerMove: { Ordered: [], Paid: [], Shipped: ["miku", "rin"], Owned: [] },
    });
  });

  test("a moved card keeps its slot when the refetch also brings a new card into its column", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 20 });
    const dropped = board();
    await refetchLands([order("miku", "Ordered"), order("rin", "Paid"), order("len", "Paid")]);

    expect({ dropped, midWrite: board() }).toEqual({
      dropped: { Ordered: [], Paid: ["miku", "rin"], Shipped: [], Owned: [] },
      midWrite: { Ordered: [], Paid: ["miku", "rin", "len"], Shipped: [], Owned: [] },
    });
  });

  test("a moved card stays below the card it was dropped under when the refetch brings a new card above both", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    const dropped = board();
    await refetchLands([order("miku", "Ordered"), order("len", "Paid"), order("rin", "Paid")]);

    expect({ dropped, midWrite: board() }).toEqual({
      dropped: { Ordered: [], Paid: ["rin", "miku"], Shipped: [], Owned: [] },
      midWrite: { Ordered: [], Paid: ["len", "rin", "miku"], Shipped: [], Owned: [] },
    });
  });

  test("a card whose moves all fail returns to its first slot, then the board follows the server", async () => {
    const { refetchLands } = await renderBoard([
      order("miku", "Ordered"),
      order("luka", "Ordered"),
      order("rin", "Paid"),
    ]);

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    await refetchLands([
      order("miku", "Ordered"),
      order("luka", "Ordered"),
      order("rin", "Paid"),
      order("len", "Shipped"),
    ]);
    await drag(handleOf("miku"), { x: 400, y: 110 }, { x: 100, y: 150 });
    server = [...server, order("kaito", "Shipped")];
    const releaseFetches = holdFetches();
    await settle(writes[0], "fail");
    await settle(writes[1], "fail");
    const afterFailures = board();
    await releaseFetches();

    expect({ sent: sentWrites(), afterFailures, afterRefetch: board() }).toEqual({
      sent: [
        { orderId: "miku", change: { status: "Paid" } },
        { orderId: "miku", change: { status: "Ordered" } },
      ],
      afterFailures: { Ordered: ["miku", "luka"], Paid: ["rin"], Shipped: ["len"], Owned: [] },
      afterRefetch: {
        Ordered: ["miku", "luka"],
        Paid: ["rin"],
        Shipped: ["len", "kaito"],
        Owned: [],
      },
    });
  });

  test("a card the server moved again during its status write shows in the server's column once the write settles", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    const movedByAnotherClient = [order("miku", "Shipped"), order("rin", "Paid")];
    await refetchLands(movedByAnotherClient);
    const midWrite = board();
    const releaseFetches = holdFetches();
    await settle(writes[0]);
    server = movedByAnotherClient;
    await releaseFetches();

    expect({ midWrite, afterWrite: board() }).toEqual({
      midWrite: { Ordered: [], Paid: ["rin", "miku"], Shipped: [], Owned: [] },
      afterWrite: { Ordered: [], Paid: ["rin"], Shipped: ["miku"], Owned: [] },
    });
  });

  test("a card held over another column never jumps back to its old column when an equal refetch lands, and its drop sends the write", async () => {
    const orders = [order("miku", "Ordered"), order("rin", "Paid")];
    const { refetchLands } = await renderBoard(orders);

    const drop = await startDrag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    const stopWatching = watchColumnsOf("miku");
    await refetchLands(orders);
    const shownInWhileHeld = stopWatching();
    await drop();

    expect({ shownInWhileHeld, sent: sentWrites(), dropped: board() }).toEqual({
      shownInWhileHeld: [],
      sent: [{ orderId: "miku", change: { status: "Paid" } }],
      dropped: { Ordered: [], Paid: ["rin", "miku"], Shipped: [], Owned: [] },
    });
  });

  test("a card dropped back in its own column shows a server change made while it was held", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);

    const drop = await startDrag(handleOf("miku"), { x: 100, y: 10 }, { x: 100, y: 70 });
    await refetchLands([
      order("miku", "Ordered", { title: "miku deluxe preorder" }),
      order("rin", "Paid"),
    ]);
    await drop();

    expect({ sent: sentWrites(), title: shownTitle("miku") }).toEqual({
      sent: [],
      title: "miku deluxe preorder",
    });
  });

  test("a drag cancelled with Escape shows a server change made while the card was held", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);

    await startDrag(handleOf("miku"), { x: 100, y: 10 }, { x: 100, y: 70 });
    await refetchLands([
      order("miku", "Ordered", { title: "miku deluxe preorder" }),
      order("rin", "Paid"),
    ]);
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await frame();

    expect({ sent: sentWrites(), title: shownTitle("miku") }).toEqual({
      sent: [],
      title: "miku deluxe preorder",
    });
  });

  test("a card flicked and released in one instant still shows server changes afterwards", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);
    const pointer = { isPrimary: true, button: 0, pointerId: 1, bubbles: true };

    const handle = handleOf("miku");
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false);
    try {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { ...pointer, clientX: 100, clientY: 10 }),
      );
      document.dispatchEvent(
        new PointerEvent("pointermove", { ...pointer, clientX: 400, clientY: 150 }),
      );
      document.dispatchEvent(
        new PointerEvent("pointerup", { ...pointer, clientX: 400, clientY: 150 }),
      );
    } finally {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    }
    await frame();
    await refetchLands([
      order("miku", "Ordered", { title: "miku deluxe preorder" }),
      order("rin", "Paid"),
    ]);

    expect(shownTitle("miku")).toBe("miku deluxe preorder");
  });

  test("a card moved to Owned leaves the board when a mid-write refetch no longer lists it and stays gone after its write settles", async () => {
    const { refetchLands } = await renderBoard([order("miku", "Ordered"), order("rin", "Paid")]);

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 1000, y: 150 });
    expect(sentWrites()).toEqual([{ orderId: "miku", change: { status: "Owned" } }]);

    await refetchLands([order("rin", "Paid")]);
    const midWrite = board();
    await settle(writes[0]);

    expect({ midWrite, afterWrite: board() }).toEqual({
      midWrite: { Ordered: [], Paid: ["rin"], Shipped: [], Owned: [] },
      afterWrite: { Ordered: [], Paid: ["rin"], Shipped: [], Owned: [] },
    });
  });

  test("an edited date stays on the card when a refetch lands mid-write", async () => {
    const { refetchLands } = await renderBoard([
      order("miku", "Paid", { paymentDate: "2026-03-10" }),
      order("rin", "Paid"),
    ]);

    await pickPaymentDate("miku", /March 20th, 2026/);
    expect(sentWrites()).toEqual([{ orderId: "miku", change: { paymentDate: "2026-03-20" } }]);

    await refetchLands([
      order("miku", "Paid", { paymentDate: "2026-03-10" }),
      order("rin", "Shipped"),
    ]);
    const midWrite = shownDate("miku", "Paid");
    await settle(writes[0]);

    expect({ midWrite, afterWrite: shownDate("miku", "Paid") }).toEqual({
      midWrite: "03/20/2026",
      afterWrite: "03/20/2026",
    });
  });

  test("a card the server moved during its date write shows in the server's column once the write settles", async () => {
    const { refetchLands } = await renderBoard([
      order("miku", "Paid", { paymentDate: "2026-03-10" }),
      order("rin", "Paid"),
    ]);

    await pickPaymentDate("miku", /March 20th, 2026/);
    await refetchLands([
      order("miku", "Shipped", { paymentDate: "2026-03-20" }),
      order("rin", "Paid"),
    ]);
    const midWrite = board();
    await settle(writes[0]);

    expect({ midWrite, afterWrite: board(), shownDate: shownDate("miku", "Paid") }).toEqual({
      midWrite: { Ordered: [], Paid: ["miku", "rin"], Shipped: [], Owned: [] },
      afterWrite: { Ordered: [], Paid: ["rin"], Shipped: ["miku"], Owned: [] },
      shownDate: "03/20/2026",
    });
  });

  test("a card moved on one month's board does not show on the next month's board while its write is in flight", async () => {
    const { showMonth } = await renderBoard(
      [
        order("miku", "Ordered", { releaseDate: "2026-03-05" }),
        order("rin", "Paid", { releaseDate: "2026-03-07" }),
        order("len", "Paid", { releaseDate: "2026-04-02" }),
      ],
      3,
    );
    const march = board();

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    await showMonth(4);

    expect({ march, aprilMidWrite: board() }).toEqual({
      march: { Ordered: ["miku"], Paid: ["rin"], Shipped: [], Owned: [] },
      aprilMidWrite: { Ordered: [], Paid: ["len"], Shipped: [], Owned: [] },
    });
  });

  test("a card moved again after a month round trip ends in the column it was moved to last", async () => {
    const { showMonth } = await renderBoard(
      [
        order("miku", "Ordered", { releaseDate: "2026-03-05" }),
        order("rin", "Paid", { releaseDate: "2026-04-02" }),
      ],
      3,
    );

    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 400, y: 150 });
    await showMonth(4);
    await showMonth(3);
    const backInMarch = board();
    await drag(handleOf("miku"), { x: 100, y: 10 }, { x: 700, y: 150 });
    const inFlight = sentWrites();
    await settle(writes[0]);
    await settle(writes[1]);

    expect({ backInMarch, inFlight, sent: sentWrites(), afterWrites: board() }).toEqual({
      backInMarch: { Ordered: ["miku"], Paid: [], Shipped: [], Owned: [] },
      inFlight: [{ orderId: "miku", change: { status: "Paid" } }],
      sent: [
        { orderId: "miku", change: { status: "Paid" } },
        { orderId: "miku", change: { status: "Shipped" } },
      ],
      afterWrites: { Ordered: [], Paid: [], Shipped: ["miku"], Owned: [] },
    });
  });
});
