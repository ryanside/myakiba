import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@myakiba/contracts/orders/types";

const order: Order = {
  orderId: "od-alpha",
  title: "Alpha Order",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "n/a",
  orderDate: "2026-10-01",
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Ordered",
  paid: false,
  total: 0,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 0,
  images: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useParams: () => ({ id: order.orderId }),
  useNavigate: () => async () => {},
  useRouter: () => ({ history: { canGoBack: () => false, back: () => {} } }),
  useLocation: () => `/orders/${order.orderId}`,
  getRouteApi: () => ({
    useRouteContext: () => ({ session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } }),
  }),
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#back">{children}</a>,
}));

const { Route } = await import("@/routes/(app)/orders_.$id");
const OrderPage = Route.options.component as () => ReactNode;

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

test("the Order page shows no Created or Updated footer", async () => {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/item-releases")) return Response.json([]);
      if (url.includes("/items"))
        return Response.json({ items: [], totalCount: 0, limit: 24, offset: 0 });
      return Response.json(order);
    },
    { preconnect: realFetch.preconnect },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrderPage />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: order.title });

  expect({
    created: screen.queryByText(/\bCreated\b/u) === null,
    updated: screen.queryByText(/\bUpdated\b/u) === null,
  }).toEqual({ created: true, updated: true });
});
