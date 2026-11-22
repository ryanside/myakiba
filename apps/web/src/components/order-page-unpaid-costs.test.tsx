import { afterEach, expect, mock, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order, OrderItem } from "@myakiba/contracts/orders/types";
import { stubFetch } from "../../test/app-route";
import { collectionItem } from "../../test/collection-item";
import { order as orderFixture } from "../../test/order";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(30_000);

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useParams: () => ({ id: "o1" }),
  useNavigate: () => async () => {},
  useRouter: () => ({ history: { canGoBack: () => false, back: () => {} } }),
  useLocation: () => "/orders/o1",
  getRouteApi: () => ({
    useRouteContext: () => ({ session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } }),
  }),
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#link">{children}</a>,
}));

const { Route } = await import("@/routes/(app)/orders_.$id");
const OrderPage = Route.options.component as () => ReactNode;

type Write = { readonly method: string; readonly settle: () => void };

let queryClient = new QueryClient();
const server = {
  order: orderFixture as Order,
  items: [] as OrderItem[],
  writes: [] as Write[],
  afterWrite: () => {},
};

afterEach(async () => {
  for (const write of server.writes) write.settle();
  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  cleanup();
  queryClient.clear();
});

function item(id: string, fields: Partial<OrderItem>): OrderItem {
  const {
    itemScale: _scale,
    createdAt: _created,
    updatedAt: _updated,
    ...rest
  } = collectionItem({ id, orderId: "o1", itemTitle: id, status: "Ordered", ...fields });
  return rest;
}

// Fees paid, a $1 paid item and a $20 unpaid item: Partly paid, Total $21.00, Unpaid Costs $20.00.
const feesPaid: Order = {
  ...orderFixture,
  orderId: "o1",
  title: "AmiAmi preorder",
  paid: true,
  payment: "partly",
  shippingFee: 0,
  total: 2100,
  unpaidCosts: 2000,
  itemCount: 2,
};

async function renderOrderPage() {
  server.order = feesPaid;
  server.items = [
    item("Miku", { paid: true, price: 100 }),
    item("Rin", { paid: false, price: 2000 }),
  ];
  server.writes = [];
  server.afterWrite = () => {};
  stubFetch(async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET") {
      if (path.endsWith("/item-releases")) return Response.json([]);
      if (path.endsWith("/items"))
        return Response.json({ items: server.items, totalCount: server.items.length });
      return Response.json(server.order);
    }
    const { promise, resolve } = Promise.withResolvers<Response>();
    server.writes.push({
      method: request.method,
      settle: () => {
        server.afterWrite();
        resolve(Response.json("ok"));
      },
    });
    return promise;
  });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OrderPage />
    </QueryClientProvider>,
  );
  await screen.findByText("Rin");
  await waitFor(() => expect(summary().total).toBe("$21.00"));
  return userEvent.setup({ delay: null });
}

function summary() {
  const amountBeside = (label: string) =>
    screen.queryByText(label, { selector: "section span" })?.nextElementSibling?.textContent ??
    null;
  return { total: amountBeside("Total"), unpaidCosts: amountBeside("Unpaid Costs") };
}

const row = (title: string) => {
  const found = screen.getByText(title).closest("tr");
  if (!found) throw new Error(`no row for ${title}`);
  return found;
};

test("paying the only unpaid item draws no Unpaid Costs on the Order page while it saves", async () => {
  const user = await renderOrderPage();
  expect(summary()).toEqual({ total: "$21.00", unpaidCosts: "$20.00" });

  await user.click(screen.getByRole("checkbox", { name: "Rin paid" }));
  await waitFor(() => expect(server.writes.length).toBe(1));

  expect(summary()).toEqual({ total: "$21.00", unpaidCosts: null });
});

test("an item price edit draws no Unpaid Costs beside the Order's new Total while it saves", async () => {
  const user = await renderOrderPage();

  await user.click(within(row("Rin")).getByRole("button", { name: /edit Price$/ }));
  const price = within(row("Rin")).getByRole("textbox", { name: "Price" });
  await user.clear(price);
  await user.type(price, "50{Enter}");
  await waitFor(() => expect(server.writes.length).toBe(1));

  expect(summary()).toEqual({ total: "$51.00", unpaidCosts: null });
});

test("removing the only unpaid item draws no Unpaid Costs while it saves, and none once the Order reads paid", async () => {
  const user = await renderOrderPage();
  server.afterWrite = () => {
    server.order = { ...feesPaid, payment: "paid", total: 100, unpaidCosts: 0, itemCount: 1 };
    server.items = server.items.filter((candidate) => candidate.id !== "Rin");
  };

  await user.click(within(row("Rin")).getByRole("button", { name: "Open menu" }));
  await user.click(await screen.findByText("Remove item"));
  const heading = await screen.findByText("Remove item?");
  const dialog = heading.closest('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) throw new Error("no Remove item dialog");
  await user.click(within(dialog).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(server.writes.length).toBe(1));
  const whileSaving = summary();
  server.writes[0]?.settle();

  await waitFor(() => expect(summary()).toEqual({ total: "$1.00", unpaidCosts: null }));
  expect(whileSaving).toEqual({ total: "$1.00", unpaidCosts: null });
});
