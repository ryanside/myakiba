import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AnyRoute, AnyRouter } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  HeadContent,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { Order } from "@myakiba/contracts/orders/types";
import { routerOptions } from "@/router-options";
import type { RouterAppContext } from "@/routes/__root";
import { order as orderFixture } from "../../test/order";
import { signedInSession } from "../../test/session";

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve() },
});

const realFetch = globalThis.fetch;
type Answer = (request: Request) => Response | Promise<Response>;
let answer: Answer = () => Response.json({});
const requests: string[] = [];

globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    requests.push(`${request.method} ${pathname}`);
    if (pathname === "/api/vocabulary") return Response.json({ shops: [], tags: [], scales: [] });
    return answer(request);
  },
  { preconnect: realFetch.preconnect },
);

const STATIC_TITLE = "myakiba - Collection Manager for Japanese Collectables";

beforeEach(() => {
  document.head.insertAdjacentHTML("afterbegin", `<title>${STATIC_TITLE}</title>`);
});

afterEach(() => {
  cleanup();
  for (const title of document.querySelectorAll("title")) title.remove();
  requests.length = 0;
  answer = () => Response.json({});
});

afterAll(() => {
  globalThis.fetch = realFetch;
  Reflect.deleteProperty(document, "fonts");
});

const { Route: orderRoute } = await import("@/routes/(app)/orders_.$id");
const { Route: itemRoute } = await import("@/routes/(app)/item_.$externalId");
const { Route: listRoute } = await import("@/routes/(app)/lists_.$listId");

const root = createRootRouteWithContext<RouterAppContext>()({
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
const app = createRoute({
  getParentRoute: () => root,
  id: "(app)",
  component: Outlet,
  beforeLoad: () => ({ session: signedInSession() }),
});
const orders = createRoute({
  getParentRoute: () => app,
  path: "/orders",
  head: () => ({ meta: [{ title: "Orders - myakiba" }] }),
  component: () => <h1>Orders</h1>,
});
const recordPagesAtGeneratedIds = [
  orderRoute.update({
    id: "/orders_/$id",
    path: "/orders/$id",
    getParentRoute: () => app,
  } as never),
  itemRoute.update({
    id: "/item_/$externalId",
    path: "/item/$externalId",
    getParentRoute: () => app,
  } as never),
  listRoute.update({
    id: "/lists_/$listId",
    path: "/lists/$listId",
    getParentRoute: () => app,
  } as never),
];
const routeTree: AnyRoute = root.addChildren([
  app.addChildren([orders, ...recordPagesAtGeneratedIds] as never),
] as never) as never;

function renderApp(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router: AnyRouter = createRouter({
    ...routerOptions,
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: {
      queryClient,
      readSession: async () => ({ session: signedInSession(), unavailable: false }),
    },
    defaultPendingMinMs: 0,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

function held() {
  const answered = Promise.withResolvers<Response>();
  return { response: answered.promise, send: answered.resolve };
}

/** What the tab shows, and every title the app renders beside index.html's own. */
const tab = () => ({
  shows: document.title,
  rendered: [...document.querySelectorAll("title")]
    .map((title) => title.textContent)
    .filter((title) => title !== STATIC_TITLE),
});
const showing = (title: string) => ({ shows: title, rendered: [title] });

async function expectTitle(title: string) {
  await waitFor(() => expect(tab()).toEqual(showing(title)));
}

const EMPTY_PAGE = { items: [], totalCount: 0, limit: 24, offset: 0 };

function orderNamed(orderId: string, title: string): Order {
  return { ...orderFixture, orderId, title };
}

function answerOrders(served: Record<string, () => Response | Promise<Response>>) {
  answer = (request) => {
    const { pathname } = new URL(request.url);
    if (pathname.endsWith("/item-releases")) return Response.json([]);
    if (pathname.endsWith("/items")) return Response.json(EMPTY_PAGE);
    const orderId = pathname.split("/").at(-1) ?? "";
    return served[orderId]?.() ?? new Response("Order not found", { status: 404 });
  };
}

test("an Order's tab names the kind while its read is pending, then the Order's title", async () => {
  const pending = held();
  answerOrders({ "od-alpha": () => pending.response });
  const { router } = renderApp("/orders");
  await screen.findByRole("heading", { name: "Orders" });
  await expectTitle("Orders - myakiba");

  await act(() => router.navigate({ to: "/orders/$id", params: { id: "od-alpha" } }));
  await screen.findByText("Loading order details");
  expect(tab()).toEqual(showing("Order - myakiba"));

  pending.send(Response.json(orderNamed("od-alpha", "Alpha Order")));
  await screen.findByRole("heading", { name: "Alpha Order" });
  expect(tab()).toEqual(showing("Alpha Order - myakiba"));
});

test("a hover then a click shows the Order's title at once, from the one read the hover started", async () => {
  answerOrders({ "od-alpha": () => Response.json(orderNamed("od-alpha", "Alpha Order")) });
  const { router } = renderApp("/orders");
  await screen.findByRole("heading", { name: "Orders" });

  await act(() => router.preloadRoute({ to: "/orders/$id", params: { id: "od-alpha" } }));
  await act(() => router.navigate({ to: "/orders/$id", params: { id: "od-alpha" } }));

  expect(screen.getByRole("heading", { name: "Alpha Order" })).toBeTruthy();
  expect(tab()).toEqual(showing("Alpha Order - myakiba"));
  expect(requests.filter((request) => request === "GET /api/orders/od-alpha")).toHaveLength(1);
});

test("a reload, a move to another Order, the back button and leaving for Orders each show the page's own title", async () => {
  const beta = held();
  answerOrders({
    "od-alpha": () => Response.json(orderNamed("od-alpha", "Alpha Order")),
    "od-beta": () => beta.response,
  });
  const { router } = renderApp("/orders/od-alpha");
  await screen.findByRole("heading", { name: "Alpha Order" });
  expect(tab()).toEqual(showing("Alpha Order - myakiba"));

  await act(() => router.navigate({ to: "/orders/$id", params: { id: "od-beta" } }));
  await screen.findByText("Loading order details");
  expect(tab()).toEqual(showing("Order - myakiba"));
  beta.send(Response.json(orderNamed("od-beta", "Beta Order")));
  await screen.findByRole("heading", { name: "Beta Order" });
  expect(tab()).toEqual(showing("Beta Order - myakiba"));

  await act(async () => router.history.back());
  await screen.findByRole("heading", { name: "Alpha Order" });
  expect(tab()).toEqual(showing("Alpha Order - myakiba"));

  await act(() => router.navigate({ to: "/orders" }));
  await screen.findByRole("heading", { name: "Orders" });
  await expectTitle("Orders - myakiba");
});

test("an Order's tab follows a rename made on its page", async () => {
  let served = orderNamed("od-alpha", "Alpha Order");
  answer = async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname.endsWith("/item-releases")) return Response.json([]);
    if (pathname.endsWith("/items")) return Response.json(EMPTY_PAGE);
    if (request.method === "PUT") {
      served = { ...served, title: "Renamed Order" };
      return Response.json(served);
    }
    return Response.json(served);
  };
  renderApp("/orders/od-alpha");
  await screen.findByRole("heading", { name: "Alpha Order" });

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const titleField = await screen.findByLabelText("Title");
  await user.clear(titleField);
  await user.type(titleField, "Renamed Order");
  await user.click(screen.getByRole("button", { name: "Update" }));

  await screen.findByRole("heading", { name: "Renamed Order" });
  expect(tab()).toEqual(showing("Renamed Order - myakiba"));
});

test("a missing Order and an Order with no title name only the kind", async () => {
  answerOrders({
    "od-blank": () => Response.json(orderNamed("od-blank", "")),
    "od-spaces": () => Response.json(orderNamed("od-spaces", "   ")),
  });
  const { router } = renderApp("/orders/od-missing");
  await screen.findByText("Order not found");
  expect(tab()).toEqual(showing("Order - myakiba"));

  await act(() => router.navigate({ to: "/orders/$id", params: { id: "od-blank" } }));
  await screen.findByText("Created");
  expect(tab()).toEqual(showing("Order - myakiba"));

  await act(() => router.navigate({ to: "/orders/$id", params: { id: "od-spaces" } }));
  await waitFor(() => expect(requests).toContain("GET /api/orders/od-spaces"));
  await screen.findByText("Created");
  expect(tab()).toEqual(showing("Order - myakiba"));
});

test("an Order rename whose write fails returns the tab to the Order's title", async () => {
  const write = held();
  answer = async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname.endsWith("/item-releases")) return Response.json([]);
    if (pathname.endsWith("/items")) return Response.json(EMPTY_PAGE);
    if (request.method === "PUT") return write.response;
    return Response.json(orderNamed("od-alpha", "Alpha Order"));
  };
  renderApp("/orders/od-alpha");
  await screen.findByRole("heading", { name: "Alpha Order" });

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const titleField = await screen.findByLabelText("Title");
  await user.clear(titleField);
  await user.type(titleField, "Renamed Order");
  await user.click(screen.getByRole("button", { name: "Update" }));
  await screen.findByRole("heading", { name: "Renamed Order", hidden: true });
  expect(tab()).toEqual(showing("Renamed Order - myakiba"));

  write.send(new Response("Order is down", { status: 503 }));
  await screen.findByRole("heading", { name: "Alpha Order", hidden: true });
  expect(tab()).toEqual(showing("Alpha Order - myakiba"));
});

const ITEM = {
  id: "item-alpha",
  title: "初音ミク 1/7 Miku with You 2021 Ver. 🎤 — a title long enough to pass any tab's width",
  mfcTitle: null,
  category: "Prepainted",
  entries: [],
  image: null,
  numbering: null,
  scale: null,
  version: [],
  releases: [],
  updatedAt: "2026-10-01T00:00:00.000Z",
};

test("an Item's tab names the kind while pending, missing or failed, then the Item's whole title", async () => {
  const pending = held();
  answer = (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/item/98777") return pending.response;
    if (pathname === "/api/item/503") return new Response("Item is down", { status: 503 });
    if (pathname.endsWith("/orders")) return Response.json({ orders: [] });
    if (pathname.endsWith("/collection")) return Response.json({ collection: [] });
    return new Response("Item not found", { status: 404 });
  };
  const { router } = renderApp("/item/98777");
  await screen.findByText("Loading item details");
  expect(tab()).toEqual(showing("Item - myakiba"));

  pending.send(Response.json({ item: ITEM, isWishlisted: false }));
  await screen.findByRole("heading", { name: ITEM.title });
  expect(tab()).toEqual(showing(`${ITEM.title} - myakiba`));

  await act(() => router.navigate({ to: "/item/$externalId", params: { externalId: 404 } }));
  await screen.findByText("Item not in the Item Database yet");
  expect(tab()).toEqual(showing("Item - myakiba"));

  await act(() => router.navigate({ to: "/item/$externalId", params: { externalId: 503 } }));
  await screen.findByText(/^Error:/);
  expect(tab()).toEqual(showing("Item - myakiba"));
});

test("a List's tab names the kind until its heading shows or when it fails, then follows the List's title through a rename", async () => {
  const pending = held();
  const members = Promise.withResolvers<null>();
  let listTitle = "Grail figures";
  answer = async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/lists/list-broken") return new Response("List is down", { status: 503 });
    if (pathname.endsWith("/members")) {
      await members.promise;
      return Response.json({ items: [], totalCount: 0 });
    }
    if (request.method === "PUT") {
      listTitle = "Shelf two";
      return Response.json({ id: "list-1", title: listTitle, description: "" });
    }
    if (listTitle === "Grail figures") return pending.response;
    return Response.json({ id: "list-1", title: listTitle, description: "" });
  };
  const { router, queryClient } = renderApp("/lists/list-1");
  await waitFor(() => expect(requests).toContain("GET /api/lists/list-1"));
  expect(tab()).toEqual(showing("List - myakiba"));

  pending.send(Response.json({ id: "list-1", title: listTitle, description: "" }));
  await waitFor(() =>
    expect(queryClient.getQueryData(["lists", "detail", "list-1"])).toEqual({
      id: "list-1",
      title: "Grail figures",
      description: "",
    }),
  );
  expect(screen.queryByRole("heading", { name: "Grail figures" })).toBeNull();
  expect(tab()).toEqual(showing("List - myakiba"));

  members.resolve(null);
  await screen.findByRole("heading", { name: "Grail figures" });
  expect(tab()).toEqual(showing("Grail figures - myakiba"));

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit" }));
  const titleField = await screen.findByLabelText("Title");
  await user.clear(titleField);
  await user.type(titleField, "Shelf two");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("heading", { name: "Shelf two" });
  expect(tab()).toEqual(showing("Shelf two - myakiba"));

  await act(() => router.navigate({ to: "/lists/$listId", params: { listId: "list-broken" } }));
  await screen.findByText("Couldn't load this List");
  expect(tab()).toEqual(showing("List - myakiba"));
});
