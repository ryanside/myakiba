import { afterEach, describe, expect, mock, test } from "bun:test";
import { useMemo } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react/pure";
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
import { collectionSearchSchema } from "@myakiba/contracts/collection/schema";
import type { CollectionPage } from "@myakiba/contracts/collection/types";
import type { Order, OrdersPage } from "@myakiba/contracts/orders/types";
import { collectionItem } from "../../../test/collection-item";

const realForm = await import("@tanstack/react-form");
const { useForm: useRealForm } = realForm;
await mock.module("@tanstack/react-form", () => ({
  ...realForm,
  useForm: (...args: Parameters<typeof useRealForm>) => {
    const form = useRealForm(...args);
    return useMemo(() => {
      const handleSubmit = form.handleSubmit;
      form.handleSubmit = (submitMeta?: Parameters<typeof handleSubmit>[0]) => {
        const submission = handleSubmit(submitMeta);
        // The pre-fix sheet drops this rejection, and Bun would fail that run outside the test.
        submission.catch(() => {});
        return submission;
      };
      return form;
    }, [form]);
  },
}));
const { default: OrdersDataGrid } = await import("@/components/orders/orders-data-grid");
const { CollectionDataGrid } = await import("@/components/collection/collection-data-grid");

const realFetch = globalThis.fetch;

let bodyDone = Promise.resolve();

afterEach(async () => {
  await bodyDone;
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

const item = collectionItem({
  id: "ci-alpha",
  orderId: order.orderId,
  itemId: "it-alpha",
  itemTitle: "Alpha Figure",
  status: "Ordered",
  price: 1000,
  shop: "AmiAmi",
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});
const collectionPage: CollectionPage = {
  items: [item],
  totalCount: 1,
  totalValue: 1000,
  totalItemsThisMonth: 0,
};

async function renderGrid(surface: "orders" | "collection", queryClient: QueryClient) {
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
  const collection = createRoute({
    getParentRoute: () => app,
    path: "/collection",
    component: CollectionDataGrid,
    validateSearch: collectionSearchSchema,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([orders, collection])]),
    history: createMemoryHistory({ initialEntries: [`/${surface}?order=asc`] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  if (surface === "orders") {
    fireEvent.click(await screen.findByRole("button", { name: "Expand row" }));
  }
  await screen.findByRole("button", { name: "Edit item" });
}

describe.each(["orders", "collection"] as const)(
  "the edit item sheet on filtered %s",
  (surface) => {
    test("keeps the typed draft after a failed save and updates pending controls", async () => {
      const done = Promise.withResolvers<undefined>();
      bodyDone = done.promise;
      const response = Promise.withResolvers<Response>();
      let requested = false;
      globalThis.fetch = Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          if (request.method === "PUT") {
            requested = true;
            return response.promise;
          }
          return Response.json(
            new URL(request.url).pathname === "/api/orders" ? page : collectionPage,
          );
        },
        { preconnect: realFetch.preconnect },
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      try {
        await renderGrid(surface, queryClient);
        fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
        fireEvent.change(await screen.findByLabelText("Count"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: "Update" }));
        await waitFor(() => expect(requested).toBe(true));
        expect(
          screen.getByRole("button", { name: "Edit item", hidden: true }).hasAttribute("disabled"),
        ).toBe(true);
        await act(async () => {
          response.resolve(new Response("Item could not be saved", { status: 503 }));
        });
        await waitFor(() =>
          expect(
            screen
              .getByRole("button", { name: "Edit item", hidden: true })
              .hasAttribute("disabled"),
          ).toBe(false),
        );
        expect(screen.getByRole("dialog", { name: "Edit Item" })).toBeTruthy();
        expect(screen.getByLabelText<HTMLInputElement>("Count").value).toBe("3");
        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Update" }).hasAttribute("aria-busy")).toBe(
            false,
          ),
        );
      } finally {
        response.resolve(new Response("Item could not be saved", { status: 503 }));
        cleanup();
        queryClient.clear();
        done.resolve();
      }
    });
  },
);
