import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AnyRoute } from "@tanstack/react-router";
import type { AnalyticsSectionRow } from "@/queries/analytics";
import type { ExpenseShopRow } from "@myakiba/contracts/expenses/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { ReactElement, ReactNode } from "react";

const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "test" } };
const params = { externalId: 123, sectionName: "shops" };

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useSearch: () => ({}),
  useParams: () => params,
  useRouter: () => ({}),
  useNavigate: () => async () => {},
  Link: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
  }) => (
    <a href="#link" className={className}>
      {children}
    </a>
  ),
  getRouteApi: () => ({
    useRouteContext: () => ({ session }),
    useSearch: () => ({}),
    useParams: () => params,
  }),
}));

const { ShopTable } = await import("./expenses/shop-table");
const { ShopTableRowExpansion } = await import("./expenses/shop-table-row-expansion");
const { OrderItemSubDataGrid } = await import("./orders/order-item-sub-data-grid");
const { ReleaseCalendar } = await import("./dashboard/release-calendar");
const { AddToListsDialog } = await import("./lists/add-to-lists-dialog");
const { InlineReleaseCell } = await import("./cells/inline-release-cell");
const { PopoverReleaseDateCell } = await import("./cells/popover-release-date-cell");
const { default: CollectionItemForm } = await import("./collection/collection-item-form");
const { default: CollectionFiltersForm } = await import("./collection/filters-form");
const { default: UnifiedItemMoveForm } = await import("./orders/unified-item-move-form");
const { AppCommand } = await import("./command/app-command");
const { ExpandedRowContent } = await import("./analytics/section-expanded-row");
const { SectionRelationships } = await import("./analytics/section-relationships");
const { Route: calendarRoute } = await import("@/routes/(app)/calendar");
const { Route: analyticsRoute } = await import("@/routes/(app)/analytics");
const { Route: analyticsSectionRoute } = await import("@/routes/(app)/analytics_.$sectionName");
const { Route: itemRoute } = await import("@/routes/(app)/item_.$externalId");

const routeHooks = {
  useSearch: () => ({}),
  useParams: () => params,
  useRouteContext: () => ({ session }),
  useNavigate: () => async () => {},
};
for (const route of [calendarRoute, analyticsRoute, analyticsSectionRoute, itemRoute])
  Object.assign(route, routeHooks);

function routePage(route: AnyRoute): ReactElement {
  const Page = route.options.component;
  if (!Page) throw new Error("Route has no component");
  return <Page />;
}

const noop = async () => {};
const trigger = <button type="button">Open</button>;
type User = ReturnType<typeof userEvent.setup>;

const shopRow = {
  id: "shop-1",
  shop: "AmiAmi",
  spend: 12_000,
  share: 1,
  scope: "collection",
  itemCount: 1,
  averageItemCost: 12_000,
} satisfies ExpenseShopRow;

const analyticsRow = {
  id: "shop-1",
  name: "AmiAmi",
  itemCount: 1,
  totalSpent: 12_000,
} satisfies AnalyticsSectionRow;

const releaseFallback = {
  releaseDate: null,
  releaseType: null,
  releasePrice: null,
  releaseCurrency: null,
  releaseBarcode: null,
};

const collectionItem = {
  id: "collection-1",
  orderId: null,
  itemId: "item-1",
  itemExternalId: 123,
  itemTitle: "Hatsune Miku",
  itemImage: null,
  status: "Owned",
  count: 1,
  score: "0",
  price: 12_000,
  shop: "AmiAmi",
  condition: "New",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "n/a",
  tags: [],
  notes: "",
  releaseId: null,
  ...releaseFallback,
} satisfies CollectionItemFormValues;

type Surface = {
  readonly name: string;
  /** The read's internal fallback, which a user must never see. */
  readonly diagnostic: string;
  readonly ui: () => ReactElement;
  readonly open?: (user: User) => Promise<void>;
};

const SURFACES: readonly Surface[] = [
  {
    name: "Expenses Shops card",
    diagnostic: "Failed to get expense shops",
    ui: () => (
      <ShopTable
        scope="collection"
        filters={{}}
        currency="USD"
        locale="en-US"
        dateFormat="MM/DD/YYYY"
      />
    ),
  },
  {
    name: "Expenses shop row expansion",
    diagnostic: "Failed to get shop expansion",
    ui: () => (
      <ShopTableRowExpansion
        row={shopRow}
        filters={{}}
        currency="USD"
        locale="en-US"
        dateFormat="MM/DD/YYYY"
      />
    ),
  },
  {
    name: "Orders row expansion",
    diagnostic: "Failed to get order items",
    ui: () => (
      <OrderItemSubDataGrid
        orderId="od-1"
        selectedOrderIdByCollectionId={new Map()}
        setSelectedOrderIdByCollectionId={() => {}}
        onEditItem={noop}
        onDeleteItem={noop}
        isCollectionItemPending={() => false}
      />
    ),
  },
  {
    name: "Dashboard release calendar",
    diagnostic: "Failed to get release calendar",
    ui: () => <ReleaseCalendar currency="USD" month={1} year={2026} />,
  },
  {
    name: "Calendar page",
    diagnostic: "Failed to get calendar",
    ui: () => routePage(calendarRoute),
  },
  {
    name: "Analytics page",
    diagnostic: "Failed to get analytics",
    ui: () => routePage(analyticsRoute),
  },
  {
    name: "Analytics section page",
    diagnostic: "Failed to get analytics section",
    ui: () => routePage(analyticsSectionRoute),
  },
  {
    name: "Analytics section items",
    diagnostic: "Failed to get analytics section items",
    ui: () => <ExpandedRowContent row={analyticsRow} sectionName="shops" />,
  },
  {
    name: "Analytics shared entries",
    diagnostic: "Failed to get analytics section relationships",
    ui: () => <SectionRelationships match={analyticsRow.id} sectionName="shops" />,
  },
  { name: "Item page header", diagnostic: "Failed to get item", ui: () => routePage(itemRoute) },
  {
    name: "Add to List dialog",
    diagnostic: "Failed to get List options",
    ui: () => (
      <AddToListsDialog
        targets={[{ type: "item", id: "item-1" }]}
        targetTitle="Hatsune Miku"
        open
        onOpenChange={() => {}}
      />
    ),
  },
  {
    name: "Collection release cell",
    diagnostic: "Failed to get item releases",
    ui: () => (
      <InlineReleaseCell
        releaseId={null}
        itemId="item-1"
        fallback={releaseFallback}
        currency="USD"
        onSubmit={noop}
      />
    ),
    open: async (user) => {
      await user.click(screen.getByRole("combobox"));
    },
  },
  {
    name: "Order release date cell",
    diagnostic: "Failed to get order item releases",
    ui: () => (
      <PopoverReleaseDateCell value={null} orderId="od-1" onSubmit={noop} trigger={trigger} />
    ),
    open: async (user) => {
      await user.click(screen.getByRole("button", { name: "Open" }));
    },
  },
  {
    name: "Collection item form release picker",
    diagnostic: "Failed to get item releases",
    ui: () => (
      <CollectionItemForm
        renderTrigger={trigger}
        itemData={collectionItem}
        callbackFn={noop}
        currency="USD"
      />
    ),
    open: async (user) => {
      await user.click(screen.getByRole("button", { name: "Open" }));
      const placeholder = await screen.findByText("Select release");
      const releasePicker = placeholder.closest('[role="combobox"]');
      if (!releasePicker) throw new Error("the form has no release picker");
      await user.click(releasePicker);
    },
  },
  {
    name: "Collection filters entry search",
    diagnostic: "Failed to search entries",
    ui: () => (
      <CollectionFiltersForm renderTrigger={trigger} onApplyFilters={() => {}} currency="USD" />
    ),
    open: async (user) => {
      await user.click(screen.getByRole("button", { name: "Open" }));
      await user.click(await screen.findByRole("combobox"));
      await user.type(await screen.findByPlaceholderText("Search entries..."), "miku");
    },
  },
  {
    name: "Move items order search",
    diagnostic: "Failed to search orders",
    ui: () => (
      <UnifiedItemMoveForm
        renderTrigger={trigger}
        selectedItems={{ collectionIds: new Set(["collection-1"]), orderIds: new Set() }}
        onMoveToExisting={noop}
        onMoveToNew={noop}
        clearSelections={() => {}}
        currency="USD"
      />
    ),
    open: async (user) => {
      await user.click(screen.getByRole("button", { name: "Open" }));
      await user.click(await screen.findByRole("combobox"));
      await user.type(screen.getByPlaceholderText("Search orders by title..."), "Target");
    },
  },
  {
    name: "Command menu search",
    diagnostic: "Failed to search orders and items",
    ui: () => <AppCommand />,
    open: async (user) => {
      await user.keyboard("{Control>}k{/Control}");
      await user.type(
        await screen.findByPlaceholderText("Search pages, actions, orders, or items…"),
        "miku",
      );
    },
  },
];

const realFetch = globalThis.fetch;
const queryClients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  for (const client of queryClients.splice(0)) client.clear();
  localStorage.clear();
});

async function renderDuringFailure(surface: Surface, response: () => Response) {
  globalThis.fetch = Object.assign(async () => response(), { preconnect: realFetch.preconnect });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClients.push(queryClient);
  render(<QueryClientProvider client={queryClient}>{surface.ui()}</QueryClientProvider>);
  await surface.open?.(userEvent.setup({ delay: null }));
}

describe.each(SURFACES)("$name", (surface) => {
  test("shows the server's 400 text", async () => {
    await renderDuringFailure(
      surface,
      () => new Response("That search is invalid", { status: 400 }),
    );

    const shown = await screen.findAllByText(/That search is invalid/);
    expect(shown.length).toBeGreaterThan(0);
  });

  test("shows the outage message for a 503 response", async () => {
    await renderDuringFailure(surface, () => new Response("Internal failure", { status: 503 }));

    const shown = await screen.findAllByText(/The server didn't answer\./);
    expect(shown.length).toBeGreaterThan(0);
    expect(screen.queryAllByText(new RegExp(surface.diagnostic))).toEqual([]);
    expect(screen.queryAllByText(/Internal failure/)).toEqual([]);
  });
});

test("the release calendar keeps its Retry button during an outage", async () => {
  const calendar = SURFACES.find(({ name }) => name === "Dashboard release calendar");
  if (!calendar) throw new Error("no release calendar surface");
  await renderDuringFailure(calendar, () => new Response("Internal failure", { status: 503 }));

  expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
});
