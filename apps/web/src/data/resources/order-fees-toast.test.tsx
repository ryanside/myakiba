import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { searchSchema as ordersSearchSchema } from "@myakiba/contracts/orders/schema";
import type { Order, OrdersPage } from "@myakiba/contracts/orders/types";
import OrdersDataGrid from "@/components/orders/orders-data-grid";
import { toast } from "@/components/ui/toast";

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

const page: OrdersPage = {
  items: [order],
  totalCount: 1,
  totalSpent: 1000,
  activeOrders: 1,
  unpaidCosts: 0,
};

/** The grid edits optimistically without filters and marks the order pending with them. */
const lists = { unfiltered: "/orders", filtered: "/orders?order=asc" } as const;

async function renderOrdersGrid(url: string, queryClient: QueryClient) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } }),
  });
  const orders = createRoute({
    getParentRoute: () => app,
    path: "/orders",
    component: OrdersDataGrid,
    validateSearch: ordersSearchSchema,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([orders])]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "$10.00" });
}

const surfaces = [
  {
    name: "fees",
    submitLabel: "Save",
    edit: async () => {
      fireEvent.click(screen.getByRole("button", { name: "$10.00" }));
      fireEvent.change(await screen.findByLabelText("Shipping"), { target: { value: "2.50" } });
    },
    settled: async () => {
      await screen.findByRole("button", { name: "$10.00" });
    },
  },
  {
    name: "dialog",
    submitLabel: "Update",
    edit: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit order" }));
      fireEvent.change(await screen.findByLabelText("Title"), {
        target: { value: "Edited order" },
      });
    },
    settled: async () => {
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Edit order", hidden: true }).hasAttribute("disabled"),
        ).toBe(false),
      );
    },
  },
] as const;

type Surface = (typeof surfaces)[number];

async function saveAndReadToasts(
  surface: Surface,
  url: string,
  respondToEdit: () => Promise<Response>,
) {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      new Request(input, init).method === "PUT" ? respondToEdit() : Response.json(page),
    { preconnect: realFetch.preconnect },
  );
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  try {
    await renderOrdersGrid(url, queryClient);
    await surface.edit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: surface.submitLabel }));
    });
    await waitFor(() => expect(added.mock.calls.length).toBeGreaterThan(0));
    await surface.settled();
    return added.mock.calls.map(([options]) => options);
  } finally {
    added.mockRestore();
    cleanup();
    queryClient.clear();
  }
}

async function toastsPerList(surface: Surface, respondToEdit: () => Promise<Response>) {
  return {
    unfiltered: await saveAndReadToasts(surface, lists.unfiltered, respondToEdit),
    filtered: await saveAndReadToasts(surface, lists.filtered, respondToEdit),
  };
}

describe.each(surfaces)("a failed order edit from $name", (surface) => {
  test("shows the server's message when the order no longer exists", async () => {
    const toasts = await toastsPerList(
      surface,
      async () => new Response("Order not found", { status: 404 }),
    );

    const shown = [{ type: "error", title: "Order not found" }];
    expect(toasts).toEqual({ unfiltered: shown, filtered: shown });
  });

  test("keeps the fallback when the server answers 503", async () => {
    const toasts = await toastsPerList(
      surface,
      async () => new Response("Internal failure", { status: 503 }),
    );

    const shown = [{ type: "error", title: "Failed to update order. Please try again." }];
    expect(toasts).toEqual({ unfiltered: shown, filtered: shown });
  });

  test("keeps the fallback when the server cannot be reached", async () => {
    const toasts = await toastsPerList(surface, async () => {
      throw new TypeError("Failed to fetch");
    });

    const shown = [{ type: "error", title: "Failed to update order. Please try again." }];
    expect(toasts).toEqual({ unfiltered: shown, filtered: shown });
  });
});
