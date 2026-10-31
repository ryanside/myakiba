import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "@/components/ui/toast";

const navigations: { readonly to: string }[] = [];
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useParams: () => ({ id: "od-alpha" }),
  useNavigate: () => async (to: { readonly to: string }) => {
    navigations.push(to);
  },
  useRouter: () => ({ history: { canGoBack: () => false, back: () => {} } }),
  useLocation: () => "/orders/od-alpha",
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
  navigations.length = 0;
});

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

function serveOrderPage(deleteAnswer: () => Response) {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") return deleteAnswer();
      if (url.includes("/item-releases")) return Response.json([]);
      if (url.includes("/items")) return Response.json(EMPTY_PAGE);
      return Response.json(ORDER);
    },
    { preconnect: realFetch.preconnect },
  );
}

async function confirmDelete(deleteAnswer: () => Response) {
  serveOrderPage(deleteAnswer);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OrderPage />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Alpha Order" });
  act(() => screen.getByRole("button", { name: "Delete" }).click());
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Delete order?")).toBeTruthy();
  act(() => within(dialog).getByRole("button", { name: "Delete" }).click());
}

test("a delete the server refuses keeps the confirm dialog open for another try", async () => {
  const added = spyOn(toast, "add");
  await confirmDelete(() => new Response("Failed to delete orders", { status: 500 }));

  await waitFor(() =>
    expect(added).toHaveBeenCalledWith({
      type: "error",
      title: "Failed to delete order(s). Please try again.",
    }),
  );
  added.mockRestore();
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    ).toMatchObject({ disabled: false }),
  );
  expect(within(screen.getByRole("dialog")).getByText("Delete order?")).toBeTruthy();
  expect(navigations).toEqual([]);
});

test("a delete that saves closes the confirm dialog and leaves the order page", async () => {
  await confirmDelete(() => new Response(null, { status: 200 }));

  await waitFor(() => expect(navigations).toEqual([{ to: "/orders" }]));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
