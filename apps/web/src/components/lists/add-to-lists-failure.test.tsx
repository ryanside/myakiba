import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#link">{children}</a>,
}));

const { Route } = await import("@/routes/(app)/orders_.$id");
const OrderPage = Route.options.component as () => ReactNode;

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
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
const OPTIONS = { lists: [{ id: "l1", title: "Grails", memberCount: 0 }] };

type Write = { readonly url: string; readonly method: string };

function serve(answerWrite: (write: Write) => Response) {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/lists/targets/options")) return Response.json(OPTIONS);
      if (method !== "GET") return answerWrite({ url, method });
      if (url.includes("/item-releases")) return Response.json([]);
      if (url.includes("/items")) return Response.json(EMPTY_PAGE);
      return Response.json(ORDER);
    },
    { preconnect: realFetch.preconnect },
  );
}

async function openAddToLists(answerWrite: (write: Write) => Response) {
  serve(answerWrite);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OrderPage />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Alpha Order" });
  act(() => screen.getByRole("button", { name: "Add to List" }).click());
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Grails");
  return dialog;
}

test("a List that fails to create shows the inline error and keeps the dialog open", async () => {
  const dialog = await openAddToLists(() => new Response("Failed to create list", { status: 500 }));
  const user = userEvent.setup();

  await user.type(within(dialog).getByPlaceholderText("List title"), "Shelf");
  await user.click(within(dialog).getByRole("button", { name: "Create" }));

  expect(await within(dialog).findByText("Couldn't create List. Try again.")).toBeTruthy();
  expect(screen.getByRole("dialog")).toBe(dialog);
});

test("an add that fails keeps the dialog open with its inline error", async () => {
  const dialog = await openAddToLists(
    () => new Response("Failed to add to Lists", { status: 500 }),
  );
  const user = userEvent.setup();

  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));

  expect(await within(dialog).findByText("Couldn't add to Lists. Try again.")).toBeTruthy();
  expect(screen.getByRole("dialog")).toBe(dialog);
});

test("an add that saves closes the dialog", async () => {
  const dialog = await openAddToLists(() => Response.json({ addedCount: 1 }));
  const user = userEvent.setup();

  await user.click(within(dialog).getByRole("checkbox"));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
