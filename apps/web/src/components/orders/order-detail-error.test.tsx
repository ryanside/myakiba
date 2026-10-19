import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useParams: () => ({ id: "od-alpha" }),
  useNavigate: () => async () => {},
  useRouter: () => ({ history: { canGoBack: () => false, back: () => {} } }),
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

function answerWith(respond: (url: string) => Promise<Response>) {
  globalThis.fetch = Object.assign((input: RequestInfo | URL) => respond(String(input)), {
    preconnect: realFetch.preconnect,
  });
}

const ORDER = {
  orderId: "od-alpha",
  title: "Alpha Order",
  shop: "AmiAmi",
  orderDate: "2026-10-01",
  releaseDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "n/a",
  status: "Paid",
  total: "0",
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  images: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  itemCount: "0",
};

const EMPTY_PAGE = { items: [], totalCount: 0, limit: 24, offset: 0 };

async function openOrderPage() {
  answerWith(async (url) => {
    if (url.includes("/item-releases")) return Response.json([]);
    if (url.includes("/items")) return Response.json(EMPTY_PAGE);
    return Response.json(ORDER);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <OrderPage />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Alpha Order" });
  return queryClient;
}

test("a refetch that cannot reach the server shows a readable message on the order page", async () => {
  const queryClient = await openOrderPage();
  answerWith(async () => {
    throw new TypeError("Failed to fetch");
  });

  await act(() => queryClient.refetchQueries({ queryKey: ["order", "od-alpha"] }));

  expect(
    await screen.findByText("Couldn't load this order. Check your connection and try again."),
  ).toBeTruthy();
  expect(screen.queryByText(/TypeError/)).toBeNull();
});

test("a refetch of a deleted order shows the server's message on the order page", async () => {
  const queryClient = await openOrderPage();
  answerWith(async () => new Response("Order not found", { status: 404 }));

  await act(() => queryClient.refetchQueries({ queryKey: ["order", "od-alpha"] }));

  expect(await screen.findByText("Order not found")).toBeTruthy();
});
