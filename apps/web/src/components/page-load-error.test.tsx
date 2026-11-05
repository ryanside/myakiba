import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AnyRoute } from "@tanstack/react-router";
import { LoadError } from "./page-states";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useSearch: () => ({}),
  useNavigate: () => async () => {},
  getRouteApi: () => ({
    useRouteContext: () => ({ session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } }),
  }),
}));

const { Route: collectionRoute } = await import("@/routes/(app)/collection");
const { Route: ordersRoute } = await import("@/routes/(app)/orders");
const { Route: expensesRoute } = await import("@/routes/(app)/expenses");
Object.assign(expensesRoute, { useSearch: () => ({}) });

const realFetch = globalThis.fetch;
const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  for (const client of queryClients.splice(0)) client.clear();
});

function renderFailingPage(route: AnyRoute) {
  globalThis.fetch = Object.assign(
    async () => new Response("That filter is invalid", { status: 400 }),
    { preconnect: realFetch.preconnect },
  );
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

describe("a page that fails to load", () => {
  test("Collection shows the server's message", async () => {
    renderFailingPage(collectionRoute);
    expect(await screen.findByText("That filter is invalid")).toBeTruthy();
  });

  test("Orders shows the server's message", async () => {
    renderFailingPage(ordersRoute);
    expect(await screen.findByText("That filter is invalid")).toBeTruthy();
  });

  test("Expenses shows the server's message", async () => {
    renderFailingPage(expensesRoute);
    expect(await screen.findByText("That filter is invalid")).toBeTruthy();
  });
});

describe("LoadError", () => {
  test("uses the server fallback when no message is supplied", () => {
    render(<LoadError title="Could not load" />);
    expect(screen.getByText("The server didn't answer.")).toBeTruthy();
  });

  test("preserves a supplied message", () => {
    render(<LoadError title="Could not load" message="Please sign in again" />);
    expect(screen.getByText("Please sign in again")).toBeTruthy();
    expect(screen.queryByText("The server didn't answer.")).toBeNull();
  });
});
