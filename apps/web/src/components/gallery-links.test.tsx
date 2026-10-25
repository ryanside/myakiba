import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { CollectionItem } from "@myakiba/contracts/collection/types";
import type { ExpenseShopRow } from "@myakiba/contracts/expenses/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import type { ReactNode } from "react";
import { ExpandedRowContent } from "./analytics/section-expanded-row";
import { SectionRelationships } from "./analytics/section-relationships";
import { CollectionGalleryGrid } from "./collection/collection-gallery-grid";
import { ShopTableRowExpansion } from "./expenses/shop-table-row-expansion";
import { OrdersGalleryGrid } from "./orders/orders-gallery-grid";
import { analytics } from "@/data/resources/analytics";
import { expenses } from "@/data/resources/expenses";
import type { AnalyticsSectionRow } from "@/queries/analytics";

afterEach(cleanup);

const IMAGE = "https://example.com/miku.jpg";
// One item with a picture and one without, since a link around a missing picture has no text.
const ITEMS = [
  { id: "item-1", externalId: 1, title: "Hatsune Miku", image: IMAGE },
  { id: "item-2", externalId: null, title: "Kagamine Rin", image: null },
] as const;
const TITLES = ITEMS.map((item) => item.title);

const collectionItems = ITEMS.map(
  (item, index) =>
    ({
      id: `collection-${index}`,
      orderId: null,
      itemId: item.id,
      itemExternalId: item.externalId,
      itemTitle: item.title,
      itemImage: item.image,
      itemCategory: "Prepainted",
      itemScale: null,
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
    }) satisfies CollectionItem,
);

// A several-picture order and an order with none.
const orders = [
  { id: "order-1", title: "Miku order", images: [IMAGE, IMAGE] },
  { id: "order-2", title: "Rin order", images: [] },
].map(
  (order) =>
    ({
      orderId: order.id,
      title: order.title,
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
      images: order.images,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }) satisfies Order,
);

const noop = async () => {};
const collectionProps = {
  items: collectionItems,
  tileSize: 180,
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
  orders,
  tileSize: 180,
  rowSelection: {},
  onRowSelectionChange: () => {},
  onEditOrder: noop,
  onDeleteOrders: noop,
  currency: "JPY",
  isOrderPending: () => false,
  isLoading: false,
} as const;

const analyticsRow = {
  id: "shop-1",
  name: "AmiAmi",
  itemCount: 2,
  totalSpent: 12_000,
} satisfies AnalyticsSectionRow;
const expenseShop = {
  id: "shop-1",
  shop: "AmiAmi",
  spend: 12_000,
  share: 1,
  scope: "collection",
  itemCount: 2,
  averageItemCost: 12_000,
} satisfies ExpenseShopRow;

async function renderGallery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(
    analytics.sectionItems.key({
      sectionName: "shops",
      filters: { match: analyticsRow.id, limit: 6, offset: 0 },
    }),
    { items: ITEMS.map(({ id, externalId, title, image }) => ({ id, externalId, title, image })) },
  );
  client.setQueryData(
    analytics.sectionRelationships.key({
      sectionName: "shops",
      filters: { match: analyticsRow.id, relatedSection: "characters", limit: 5, offset: 0 },
    }),
    {
      items: [
        {
          id: "character-1",
          name: "Hatsune Miku",
          itemCount: 2,
          previewItems: ITEMS.map(({ id, externalId, title }) => ({
            id,
            externalId,
            title,
            image: IMAGE,
          })),
        },
      ],
      totalCount: 1,
    },
  );
  client.setQueryData(
    expenses.shopExpansion.key({ shopId: expenseShop.id, filters: { scope: expenseShop.scope } }),
    {
      scope: "collection",
      items: ITEMS.map((item, index) => ({
        collectionId: `collection-${index}`,
        itemId: item.id,
        externalId: item.externalId,
        title: item.title,
        image: item.image,
      })),
    },
  );
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    component: Outlet,
    beforeLoad: () => ({ session: { user: { currency: "JPY", dateFormat: "MM/DD/YYYY" } } }),
  });
  const route = createRoute({ getParentRoute: () => app, path: "/", component: () => ui });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([route])]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe.each([
  ...(["square", "masonry"] as const).flatMap((galleryLayout) => [
    {
      name: `Collection ${galleryLayout} gallery`,
      titles: TITLES,
      ui: () => <CollectionGalleryGrid {...collectionProps} galleryLayout={galleryLayout} />,
    },
    {
      name: `Orders ${galleryLayout} gallery`,
      titles: orders.map((order) => order.title),
      ui: () => <OrdersGalleryGrid {...ordersProps} galleryLayout={galleryLayout} />,
    },
  ]),
  {
    name: "Analytics section items",
    titles: TITLES,
    ui: () => <ExpandedRowContent row={analyticsRow} sectionName="shops" />,
  },
  {
    name: "Analytics shared item previews",
    titles: TITLES,
    ui: () => <SectionRelationships match={analyticsRow.id} sectionName="shops" />,
  },
  {
    name: "Expenses recent owned items",
    titles: TITLES,
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
])("$name", ({ titles, ui }) => {
  test("names each image link by its title alone", async () => {
    await renderGallery(ui());
    for (const title of titles) {
      expect(screen.getAllByRole("link", { name: title }).length).toBeGreaterThan(0);
      const padded = (name: string) => name.includes(title) && name !== title;
      const paddedLinks = screen.queryAllByRole("link", { name: padded });
      expect(paddedLinks.map((link) => link.getAttribute("href"))).toEqual([]);
    }
  });
});
