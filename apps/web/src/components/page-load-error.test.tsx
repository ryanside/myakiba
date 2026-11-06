import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AnyRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ReadError } from "@/lib/read-response";
import { LoadError } from "./page-states";

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve() },
});
afterAll(() => {
  Reflect.deleteProperty(document, "fonts");
});

let pageSearch = {};
const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "test" } };

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useSearch: () => pageSearch,
  useRouter: () => ({}),
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => async () => {},
  getRouteApi: () => ({
    useRouteContext: () => ({ session }),
    useSearch: () => ({ page: 1, pageSize: 25 }),
  }),
}));

const { Route: collectionRoute } = await import("@/routes/(app)/collection");
const { Route: ordersRoute } = await import("@/routes/(app)/orders");
const { Route: expensesRoute } = await import("@/routes/(app)/expenses");
const { Route: listsRoute } = await import("@/routes/(app)/lists");
const { Route: listRoute } = await import("@/routes/(app)/lists_.$listId");
const { Route: wishlistRoute } = await import("@/routes/(app)/wishlist");
const { Route: dashboardRoute } = await import("@/routes/(app)/dashboard");
const { Route: itemsRoute } = await import("@/routes/(app)/items");

const pages = [
  ["Collection", collectionRoute, {}],
  ["Orders", ordersRoute, {}],
  ["Expenses", expensesRoute, {}],
  ["Lists", listsRoute, {}],
  ["List detail", listRoute, {}],
  ["Wishlist", wishlistRoute, { releaseStatus: "all" }],
  ["Dashboard overview", dashboardRoute, {}],
  ["Dashboard monthly", dashboardRoute, { tab: "monthly" }],
  ["Item Database", itemsRoute, {}],
] as const;

const routeHooks = {
  useSearch: () => pageSearch,
  useParams: () => ({ listId: "list-1" }),
  useRouteContext: () => ({ session }),
  useNavigate: () => async () => {},
};
for (const [, route] of pages) Object.assign(route, routeHooks);

const realFetch = globalThis.fetch;
const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  for (const client of queryClients.splice(0)) client.clear();
});

function renderPage(route: AnyRoute, respond: (input: RequestInfo | URL) => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, {
    preconnect: realFetch.preconnect,
  });
  const Page = route.options.component;
  if (!Page) throw new Error("Route has no component");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>,
  );
}

describe.each(pages)("%s load errors", (_name, route, search) => {
  test("shows the server's 400 text message", async () => {
    pageSearch = search;
    renderPage(route, async () => new Response("That filter is invalid", { status: 400 }));
    expect(await screen.findByText("That filter is invalid")).toBeTruthy();
  });

  test.each([500, 503])("uses the server fallback for a %s response", async (status) => {
    pageSearch = search;
    renderPage(route, async () => new Response("Internal failure", { status }));
    expect(await screen.findByText("The server didn't answer.")).toBeTruthy();
    expect(screen.queryByText(/Failed to (get|load|search)/)).toBeNull();
  });

  test("uses the server fallback for a network failure", async () => {
    pageSearch = search;
    renderPage(route, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await screen.findByText("The server didn't answer.")).toBeTruthy();
  });
});

test.each([400, 503])(
  "List member errors use the safe message for a %s response",
  async (status) => {
    pageSearch = {};
    renderPage(listRoute, async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url).pathname === "/api/lists/list-1") {
        return Response.json({ id: "list-1", title: "My List", description: "" });
      }
      return new Response("That filter is invalid", { status });
    });
    expect(
      await screen.findByText(
        status === 400 ? "That filter is invalid" : "The server didn't answer.",
      ),
    ).toBeTruthy();
  },
);

describe.each([
  ["Collection", collectionRoute],
  ["Orders", ordersRoute],
] as const)("%s with no response data", (_name, route) => {
  test("shows the server fallback instead of diagnostic text", async () => {
    pageSearch = {};
    renderPage(route, async () => Response.json(null));
    expect(await screen.findByText("The server didn't answer.")).toBeTruthy();
    expect(screen.queryByText(/Failed to get/)).toBeNull();
  });
});

describe("LoadError", () => {
  test.each([
    new Error("Failed to get collection"),
    new ReadError("Failed to load", { status: 400, value: " " }),
    new ReadError("Failed to load", { status: 422, value: { message: "Expected string" } }),
    new ReadError("Failed to load", { status: 503, value: "Internal failure" }),
  ])("uses the server fallback when an error has no user message", (loadError) => {
    render(<LoadError title="Could not load" error={loadError} />);
    expect(screen.getByText("The server didn't answer.")).toBeTruthy();
    expect(screen.queryByText(/Failed to/)).toBeNull();
  });

  test("uses the server fallback when no error is supplied", () => {
    render(<LoadError title="Could not load" />);
    expect(screen.getByText("The server didn't answer.")).toBeTruthy();
  });

  test("preserves a server user message", () => {
    render(
      <LoadError
        title="Could not load"
        error={new ReadError("Failed to load", { status: 401, value: "Please sign in again" })}
      />,
    );
    expect(screen.getByText("Please sign in again")).toBeTruthy();
    expect(screen.queryByText("The server didn't answer.")).toBeNull();
  });
});
