import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ReactNode } from "react";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useParams: () => ({ externalId: 98_777 }),
  useNavigate: () => async () => {},
  useRouter: () => ({ history: { canGoBack: () => false, back: () => {} } }),
  getRouteApi: () => ({
    useRouteContext: () => ({ session: { user: { currency: "USD", dateFormat: "MM/DD/YYYY" } } }),
  }),
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#back">{children}</a>,
}));
const thrown = new TypeError("cannot read properties of undefined (reading 'collection')");
const realItemQueries = await import("@/queries/item");
await mock.module("@/queries/item", () => ({
  ...realItemQueries,
  getItem: async () =>
    Result.ok({
      item: {
        id: "item-alpha",
        title: "Alpha Figure",
        mfcTitle: null,
        category: "Prepainted",
        entries: [],
        image: null,
        numbering: null,
        scale: null,
        version: [],
        releases: [],
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      isWishlisted: false,
    }),
  getItemRelatedOrders: async () => Result.ok({ orders: [] }),
  getItemRelatedCollection: async () => {
    throw thrown;
  },
}));

const { Route } = await import("@/routes/(app)/item_.$externalId");
const ItemPage = Route.options.component as () => ReactNode;
const { createQueryClient } = await import("@/data/client");

afterEach(cleanup);

test("a defect in the item page's Collection read shows the safe text, not its own message", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ItemPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Couldn't load your Collection")).toBeTruthy();
  expect(screen.getByText("Something went wrong. Reload the page and try again")).toBeTruthy();
  expect(screen.queryByText(/cannot read properties/)).toBeNull();
  logged.mockRestore();
});

test("a defect in the item page's Collection read is logged once with what was thrown", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ItemPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Couldn't load your Collection")).toBeTruthy();
  expect(screen.getByText("Something went wrong. Reload the page and try again")).toBeTruthy();
  expect(screen.queryByText(/cannot read properties/)).toBeNull();
  const reported = logged.mock.calls.filter((call) => call.includes(thrown));
  logged.mockRestore();
  expect(reported).toHaveLength(1);
});
