import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { CollectionItem } from "@myakiba/contracts/collection/types";
import type { ExpenseOrder, ExpenseShopRow } from "@myakiba/contracts/expenses/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import type { ReactNode } from "react";
import { ExpandedRowContent } from "./analytics/section-expanded-row";
import { SectionRelationships } from "./analytics/section-relationships";
import { CalendarItemRow } from "./calendar/calendar-item-row";
import { CalendarOrderRow } from "./calendar/calendar-order-row";
import { CollectionCardGrid } from "./collection/collection-card-grid";
import { CollectionGalleryGrid } from "./collection/collection-gallery-grid";
import OrderKanban from "./dashboard/order-kanban";
import { ReleaseCalendar } from "./dashboard/release-calendar";
import { DataTable } from "./data-table/data-table";
import { ExpenseOrderRow } from "./expenses/order-row";
import { ShopTableRowExpansion } from "./expenses/shop-table-row-expansion";
import { OrdersCardGrid } from "./orders/orders-card-grid";
import { OrdersGalleryGrid } from "./orders/orders-gallery-grid";
import { DataGrid } from "./reui/data-grid/data-grid";
import { DataGridTable } from "./reui/data-grid/data-grid-table";
import { analytics } from "@/data/resources/analytics";
import { calendar } from "@/data/resources/calendar";
import { expenses } from "@/data/resources/expenses";
import type { AnalyticsSectionRow } from "@/queries/analytics";
import type { CalendarItem, CalendarOrder } from "@/queries/calendar";
import type { DashboardKanbanOrder, ReleaseItem } from "@/queries/dashboard";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const image = "https://example.com/miku.jpg";

const collectionItem = {
  id: "collection-1",
  orderId: null,
  itemId: "item-1",
  itemExternalId: 123,
  itemTitle: "Hatsune Miku",
  itemImage: image,
  itemCategory: "Prepainted",
  itemScale: "1/7",
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
  releaseDate: null,
  releasePrice: null,
  releaseType: null,
  releaseCurrency: null,
  releaseBarcode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies CollectionItem;

const order = {
  orderId: "order-1",
  title: "Miku order",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "n/a",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Paid",
  total: 12_000,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 2,
  images: [image, image],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies Order;

const calendarItem = {
  releaseId: "release-1",
  releaseDate: "2026-01-02",
  itemId: "item-1",
  itemExternalId: 123,
  title: "Hatsune Miku",
  image,
  category: "Prepainted",
  price: 12_000,
  priceCurrency: "JPY",
} satisfies CalendarItem;

const calendarOrder = {
  orderId: "order-1",
  title: "Miku order",
  shop: "AmiAmi",
  images: [image],
  itemCount: 2,
  status: "Paid",
  releaseDate: "2026-01-02",
  total: 12_000,
} satisfies CalendarOrder;

const releaseItem = calendarItem satisfies ReleaseItem;

const expenseOrder = {
  orderId: "order-1",
  title: "Miku order",
  shop: "AmiAmi",
  expenseDate: "2026-01-02",
  images: [image],
  feeSpend: 1000,
  totalSpend: 12_000,
} satisfies ExpenseOrder;

const kanbanOrder = {
  orderId: "order-1",
  title: "Miku order",
  status: "Paid",
  shop: "AmiAmi",
  total: 12_000,
  itemImages: [image],
  itemIds: ["item-1"],
  releaseDate: null,
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
} satisfies DashboardKanbanOrder;

const analyticsRow = {
  id: "shop-1",
  name: "AmiAmi",
  itemCount: 1,
  totalSpent: 12_000,
} satisfies AnalyticsSectionRow;
const analyticsItems = {
  sectionName: "shops",
  filters: { match: analyticsRow.id, limit: 6, offset: 0 },
} as const;
const analyticsRelationships = {
  sectionName: analyticsItems.sectionName,
  filters: { match: analyticsRow.id, relatedSection: "characters", limit: 5, offset: 0 },
} as const;

const expenseShop = {
  id: "shop-1",
  shop: "AmiAmi",
  spend: 12_000,
  share: 1,
  scope: "collection",
  itemCount: 1,
  averageItemCost: 12_000,
} satisfies ExpenseShopRow;

const noop = async () => {};

const tableRows = [{ id: "row-1", title: "Hatsune Miku" }];

function TableRow(): ReactNode {
  const table = useReactTable({
    data: tableRows,
    columns: [{ accessorKey: "title", header: "Title" }],
    getCoreRowModel: getCoreRowModel(),
  });
  return <DataTable table={table} empty={null} onRowClick={() => {}} />;
}

function GridRow(): ReactNode {
  const table = useReactTable({
    data: tableRows,
    columns: [{ accessorKey: "title", header: "Title" }],
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <DataGrid table={table} recordCount={tableRows.length}>
      <DataGridTable />
    </DataGrid>
  );
}

const collectionProps = {
  items: [collectionItem],
  rowSelection: {},
  onRowSelectionChange: () => {},
  onEditCollectionItem: noop,
  onDeleteCollectionItems: noop,
  onAddCollectionItemsToOrder: noop,
  onAddCollectionItemsToNewOrder: noop,
  currency: "JPY",
  dateFormat: "MM/DD/YYYY",
  isCollectionPending: () => false,
  isCollectionOrderPending: () => false,
  isLoading: false,
} as const;

const ordersProps = {
  orders: [order],
  rowSelection: {},
  onRowSelectionChange: () => {},
  onEditOrder: noop,
  onDeleteOrders: noop,
  currency: "JPY",
  isOrderPending: () => false,
  isLoading: false,
} as const;

async function renderScreen(ui: ReactNode, storage: Readonly<Record<string, string>> = {}) {
  for (const [key, value] of Object.entries(storage))
    localStorage.setItem(key, JSON.stringify(value));
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(calendar.releases.key({ month: 1, year: 2026 }), {
    releaseCalendar: { releases: [releaseItem] },
  });
  client.setQueryData(analytics.sectionItems.key(analyticsItems), {
    items: [{ id: "item-1", externalId: 123, title: calendarItem.title, image }],
    totalCount: 1,
  });
  client.setQueryData(analytics.sectionRelationships.key(analyticsRelationships), {
    items: [
      {
        id: "character-1",
        name: "Hatsune Miku",
        itemCount: 1,
        previewItems: [{ id: "item-1", externalId: 123, title: calendarItem.title, image }],
      },
    ],
    totalCount: 1,
  });
  client.setQueryData(
    expenses.shopExpansion.key({ shopId: expenseShop.id, filters: { scope: expenseShop.scope } }),
    {
      scope: "collection",
      items: [
        {
          collectionId: "collection-1",
          itemId: "item-1",
          externalId: 123,
          title: calendarItem.title,
          image,
        },
      ],
    },
  );
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "JPY", dateFormat: "MM/DD/YYYY" } } }),
  });
  const route = createRoute({
    getParentRoute: () => app,
    path: "/items",
    component: () => ui,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([route])]),
    history: createMemoryHistory({ initialEntries: ["/items"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

type Surface = "card" | "gallery" | "row";

// What hover may change on each surface type: the element it lands on and the properties it
// changes there. Nothing else, so hover never moves a shadow, ring or transform. A card or a
// gallery tile strengthens the edge it already has, and a row, which has none, is tinted.
const LANGUAGE = {
  card: { on: "tile", changes: [{ target: "self", property: "border-color" }] },
  gallery: {
    on: "image",
    changes: [{ target: "::after", property: "border-color" }],
  },
  row: { on: "tile", changes: [{ target: "self", property: "background-color" }] },
} as const satisfies Record<
  Surface,
  { readonly on: "tile" | "image"; readonly changes: readonly Change[] }
>;

const SCREENS: readonly {
  readonly name: string;
  readonly surface: Surface;
  readonly ui: () => ReactNode;
  readonly storage?: Readonly<Record<string, string>>;
  readonly select?: string;
}[] = [
  {
    name: "Collection cards",
    surface: "card",
    ui: () => <CollectionCardGrid {...collectionProps} cardWidth={200} locale="en-US" />,
  },
  {
    name: "Orders cards",
    surface: "card",
    ui: () => <OrdersCardGrid {...ordersProps} cardWidth={200} locale="en-US" />,
  },
  {
    name: "Dashboard order card",
    surface: "card",
    ui: () => (
      <OrderKanban
        orders={[kanbanOrder]}
        ordersUpdatedAt={0}
        isLoading={false}
        currency="JPY"
        dateFormat="MM/DD/YYYY"
      />
    ),
    select: '[data-slot="kanban-item-handle"] > *',
  },
  ...(["square", "masonry"] as const).flatMap((galleryLayout) => [
    {
      name: `Collection ${galleryLayout} gallery`,
      surface: "gallery" as const,
      ui: () => (
        <CollectionGalleryGrid {...collectionProps} tileSize={180} galleryLayout={galleryLayout} />
      ),
    },
    {
      name: `Orders ${galleryLayout} gallery`,
      surface: "gallery" as const,
      ui: () => <OrdersGalleryGrid {...ordersProps} tileSize={180} galleryLayout={galleryLayout} />,
    },
  ]),
  {
    name: "Analytics section items",
    surface: "gallery",
    ui: () => <ExpandedRowContent row={analyticsRow} sectionName={analyticsItems.sectionName} />,
  },
  {
    name: "Analytics shared item previews",
    surface: "gallery",
    ui: () => (
      <SectionRelationships match={analyticsRow.id} sectionName={analyticsItems.sectionName} />
    ),
  },
  {
    name: "Expenses recent owned items",
    surface: "gallery",
    ui: () => (
      <ShopTableRowExpansion
        row={expenseShop}
        filters={{}}
        currency="JPY"
        locale="en-US"
        dateFormat="MM/DD/YYYY"
      />
    ),
  },
  {
    name: "Calendar item row",
    surface: "row",
    ui: () => <CalendarItemRow item={calendarItem} currency="JPY" />,
    select: "a",
  },
  {
    name: "Calendar order row",
    surface: "row",
    ui: () => <CalendarOrderRow order={calendarOrder} currency="JPY" locale="en-US" />,
    select: "a",
  },
  {
    name: "Dashboard release row",
    surface: "row",
    ui: () => <ReleaseCalendar currency="JPY" month={1} year={2026} hideControls />,
    select: 'a[href^="/item/"]',
  },
  {
    name: "Expenses order row",
    surface: "row",
    ui: () => (
      <ExpenseOrderRow order={expenseOrder} currency="JPY" locale="en-US" dateFormat="MM/DD/YYYY" />
    ),
    select: "a",
  },
  {
    name: "Analytics and expenses table row",
    surface: "row",
    ui: () => <TableRow />,
    select: "tbody tr",
  },
  {
    name: "Collection, Orders and order item table row",
    surface: "row",
    ui: () => <GridRow />,
    select: "tbody tr",
  },
];

function splitVariants(className: string) {
  const variants: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of className) {
    if (char === "[" || char === "(") depth += 1;
    if (char === "]" || char === ")") depth -= 1;
    if (char === ":" && depth === 0) {
      variants.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  return { variants, utility: current };
}

const PROPERTY_BY_PREFIX = [
  ["bg-", "background-color"],
  ["border-", "border-color"],
  ["text-", "color"],
  ["-outline-offset-", "outline-offset"],
  ["outline-offset-", "outline-offset"],
  ["outline-(", "outline-color"],
  ["outline-", "outline-width"],
] as const;

type Change = { readonly target: "self" | "::after"; readonly property: string };

function targetOf(variants: readonly string[]): Change["target"] {
  return variants.includes("after") ? "::after" : "self";
}

function hoverChanges(element: Element): Change[] {
  return [...element.classList].flatMap((className) => {
    const { variants, utility } = splitVariants(className);
    if (!variants.some((variant) => /^(?:group-)?hover(?:\/|$)/.test(variant))) return [];
    const property =
      PROPERTY_BY_PREFIX.find(([prefix]) => utility.startsWith(prefix))?.[1] ?? utility;
    return [{ target: targetOf(variants), property }];
  });
}

function hoverClasses(element: Element): string[] {
  return [...element.classList]
    .filter((className) =>
      splitVariants(className).variants.some((variant) => /^(?:group-)?hover/.test(variant)),
    )
    .toSorted();
}

function motionClasses(element: Element): string[] {
  return [...element.classList].filter((className) =>
    /^(?:transition|duration-|ease-|delay-)/.test(splitVariants(className).utility),
  );
}

function tokens(element: Element): string[] {
  return [...element.className.matchAll(/\((--[\w-]+)\)/g)].map((match) => match[1] ?? "");
}

const css = readFileSync(new URL("../index.css", import.meta.url), "utf-8");

function themeTokens(selector: string): ReadonlyMap<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("\n}", start));
  return new Map(
    [...block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [
      match[1] ?? "",
      match[2]?.trim() ?? "",
    ]),
  );
}

function isTranslucent(color: string | undefined): boolean {
  if (color === undefined) return false;
  const alpha = /\/\s*([\d.]+)\s*\)$/.exec(color)?.[1];
  return /\btransparent\b/.test(color) || (alpha !== undefined && Number(alpha) < 1);
}

const THEMES = { light: themeTokens(":root"), dark: themeTokens(".dark") };

async function surfaces(screen: (typeof SCREENS)[number]): Promise<Element[]> {
  const { container } = await renderScreen(screen.ui(), screen.storage);
  const tiles = [...container.querySelectorAll(screen.select ?? ".group\\/item")];
  expect(tiles.length).toBeGreaterThan(0);
  if (LANGUAGE[screen.surface].on === "tile") return tiles;
  return tiles.map((tile) => {
    const imageElement = tile.querySelector("a")?.firstElementChild;
    if (!imageElement) throw new Error(`${screen.name} tile has no image inside its link`);
    expect(hoverChanges(tile)).toEqual([]);
    return imageElement;
  });
}

describe.each(SCREENS)("$name", (screen) => {
  const language = LANGUAGE[screen.surface];

  test("hover changes only the surface's own colours and edge, instantly", async () => {
    for (const element of await surfaces(screen)) {
      const byProperty = (a: Change, b: Change) => a.property.localeCompare(b.property);
      expect(hoverChanges(element).toSorted(byProperty)).toEqual(
        language.changes.toSorted(byProperty),
      );
      expect(motionClasses(element)).toEqual([]);
    }
  });

  test("every token the surface reads is defined in light and dark", async () => {
    for (const element of await surfaces(screen)) {
      for (const token of tokens(element)) {
        expect(THEMES.light.has(token)).toBe(true);
        expect(THEMES.dark.has(token)).toBe(true);
      }
    }
  });
});

test.each(["card", "gallery", "row"] as const)(
  "every %s surface takes the same hover classes",
  async (surface) => {
    const classes = new Set<string>();
    for (const screen of SCREENS.filter((candidate) => candidate.surface === surface)) {
      for (const element of await surfaces(screen)) classes.add(hoverClasses(element).join(" "));
      cleanup();
      localStorage.clear();
    }
    expect([...classes]).toHaveLength(1);
  },
);

test.each([
  [
    "Collection cards",
    () => <CollectionCardGrid {...collectionProps} isLoading cardWidth={200} locale="en-US" />,
  ],
  [
    "Orders cards",
    () => <OrdersCardGrid {...ordersProps} isLoading cardWidth={200} locale="en-US" />,
  ],
  [
    "Collection gallery",
    () => (
      <CollectionGalleryGrid {...collectionProps} isLoading tileSize={180} galleryLayout="square" />
    ),
  ],
  [
    "Orders gallery",
    () => <OrdersGalleryGrid {...ordersProps} isLoading tileSize={180} galleryLayout="square" />,
  ],
] as const)("%s loading placeholders take no hover", async (_name, ui) => {
  const { container } = await renderScreen(ui());
  const placeholders = container.querySelectorAll('[data-slot="skeleton"]');
  expect(placeholders.length).toBeGreaterThan(0);
  for (const element of container.querySelectorAll("*")) expect(hoverClasses(element)).toEqual([]);
});

// A backdrop filter gives every bar its own compositing layer, so the bars stay flat. Item Database,
// Analytics, Expenses and Dashboard tiles have no control bar, and rows keep theirs inline.
const SCREENS_WITH_BARS = SCREENS.filter(
  (screen) =>
    !["Item Database", "Analytics", "Expenses", "Dashboard"].some((prefix) =>
      screen.name.startsWith(prefix),
    ) && screen.surface !== "row",
);

test.each(SCREENS_WITH_BARS)("$name control bars take no backdrop filter", async (screen) => {
  const { container } = await renderScreen(screen.ui(), screen.storage);
  const bars = container.querySelectorAll('[data-slot="item-controls"]');
  expect(bars.length).toBeGreaterThan(0);
  for (const bar of bars) {
    for (const element of [bar, ...bar.querySelectorAll("*")]) {
      expect([...element.classList].filter((name) => name.includes("backdrop-"))).toEqual([]);
    }
  }
});

test("a row hovers to a translucent tint and nothing else, in both themes", async () => {
  for (const screen of SCREENS.filter((candidate) => candidate.surface === "row")) {
    for (const element of await surfaces(screen)) {
      expect(hoverClasses(element)).toEqual(["hover:bg-(--row-hover)"]);
    }
    cleanup();
    localStorage.clear();
  }
  for (const theme of Object.values(THEMES)) {
    expect(isTranslucent(theme.get("--row-hover"))).toBe(true);
  }
});
