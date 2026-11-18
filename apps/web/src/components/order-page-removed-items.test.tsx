import { afterEach, expect, mock, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OrderItem } from "@myakiba/contracts/orders/types";
import { parseJson } from "@myakiba/utils/parse-json";
import { z } from "zod";
import { stubFetch } from "../../test/app-route";
import { collectionItem } from "../../test/collection-item";
import { order } from "../../test/order";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(30_000);

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useParams: () => ({ id: "od-alpha" }),
  useNavigate: () => async () => {},
  useRouter: () => ({ history: { canGoBack: () => false, back: () => {} } }),
  useLocation: () => "/orders/od-alpha",
  getRouteApi: () => ({
    useRouteContext: () => ({ session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } }),
  }),
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#link">{children}</a>,
}));

const { Route } = await import("@/routes/(app)/orders_.$id");
const OrderPage = Route.options.component as () => ReactNode;

afterEach(cleanup);

function orderItem(id: string): OrderItem {
  const {
    itemScale: _scale,
    createdAt: _created,
    updatedAt: _updated,
    ...item
  } = collectionItem({ id, orderId: "od-alpha", itemTitle: id, status: "Ordered" });
  return item;
}

function around(element: Element, selector: string): HTMLElement {
  const found = element.closest<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector} around "${element.textContent}"`);
  return found;
}

const row = (title: string) => around(screen.getByText(title), "tr");
const selection = () => document.querySelector('[role="toolbar"]')?.textContent ?? "";

async function confirm(user: ReturnType<typeof userEvent.setup>, title: string, label: string) {
  const heading = await screen.findByText(title);
  await user.click(within(around(heading, '[role="dialog"]')).getByRole("button", { name: label }));
}

test("an Order Item removed from its row menu leaves the Order page's selection", async () => {
  let items = [orderItem("co-miku"), orderItem("co-rin")];
  const writes: { readonly path: string; readonly collectionIds: readonly string[] }[] = [];
  stubFetch(async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") {
      const text = await request.text();
      const collectionIds = text
        ? parseJson(z.object({ collectionIds: z.array(z.string()) }), text).unwrap().collectionIds
        : [path.split("/").at(-1) ?? ""];
      writes.push({ path, collectionIds });
      items = items.filter((item) => !collectionIds.includes(item.id));
      return Response.json("ok");
    }
    if (path.endsWith("/item-releases")) return Response.json([]);
    if (path.endsWith("/items")) return Response.json({ items, totalCount: items.length });
    return Response.json({
      ...order,
      orderId: "od-alpha",
      title: "Alpha",
      itemCount: items.length,
    });
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OrderPage />
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ delay: null });
  await screen.findByText("co-rin");
  for (const title of ["co-miku", "co-rin"]) {
    await user.click(within(row(title)).getByRole("checkbox", { name: "Select row" }));
  }
  expect(selection()).toContain("2 items selected");

  await user.click(within(row("co-rin")).getByRole("button", { name: "Open menu" }));
  await user.click(await screen.findByText("Remove item"));
  await confirm(user, "Remove item?", "Remove");
  await waitFor(() => expect(writes).toHaveLength(1));
  await waitFor(() => expect(screen.queryAllByText("co-rin").length).toBe(0));
  expect(selection()).toContain("1 item selected");

  await user.click(within(screen.getByRole("toolbar")).getByText("Delete Items"));
  await confirm(user, "Delete 1 item?", "Delete");
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual({ path: "/api/orders/items", collectionIds: ["co-miku"] });
  queryClient.clear();
});
