// The Add page in a real router, with a fake server and extension, for the tests that drive it.
import { mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ItemRelease } from "@myakiba/contracts/item/schema";
import type { AddItem } from "@/components/add/commit-input";
import { Toaster } from "@/components/ui/toast";
import { delegatingBridge, fakeExtension } from "./fake-extension";

type Answer =
  | { readonly data: unknown; readonly error: null }
  | { readonly data: null; readonly error: { readonly status: number; readonly value: unknown } };

const ok = <Data,>(data: Data): Answer => ({ data, error: null });
export const refused = (status: number, value: string): Answer => ({
  data: null,
  error: { status, value },
});

type CommitBody = {
  readonly commitId: string;
  readonly rows: readonly {
    readonly itemId: string;
    readonly price: number | null;
    readonly releaseId?: string;
    readonly shippingMethod?: string;
    readonly shop?: string;
    readonly score?: string;
    readonly count?: number;
    readonly condition?: string;
    readonly notes?: string;
    readonly tags?: readonly string[];
    readonly orderDate?: string | null;
    readonly paymentDate?: string | null;
    readonly shippingDate?: string | null;
    readonly collectionDate?: string | null;
  }[];
  readonly ownership: {
    readonly kind: string;
    readonly shared?: Readonly<Record<string, string | number | null>>;
    readonly order?: { readonly fields?: Readonly<Record<string, string | number | null>> };
  };
  readonly wishlist: boolean;
  readonly listIds: readonly string[];
};

const searchAnswer = (text: string): Answer => {
  const items = [...server.items.values()].filter(({ title }) =>
    title.toLowerCase().includes(text.toLowerCase()),
  );
  return ok({ items, totalCount: items.length });
};

const answerOf = (body: CommitBody) =>
  ok({
    committed: body.rows.map(({ itemId }) => {
      const item = server.items.get(itemId);
      return {
        itemId,
        externalId: item?.externalId ?? null,
        title: item?.title ?? itemId,
        image: item?.image ?? null,
        collectionId: body.ownership.kind === "none" ? null : `collection-${itemId}`,
      };
    }),
    orderId: body.ownership.kind === "order" ? "order-answered" : null,
    wishlistAdded: body.wishlist ? body.rows.length : 0,
    listIds: body.listIds,
  });

export const server = {
  releases: new Map<string, readonly ItemRelease[]>(),
  /** What a stub page shows under its heading, by its path. */
  pages: new Map<string, () => ReactNode>(),
  items: new Map<string, AddItem>(),
  itemsFailure: null as Answer | null,
  /** Holds every read of the rows' Items until it resolves. */
  itemsGate: null as Promise<void> | null,
  searches: [] as string[],
  search: async (text: string): Promise<Answer> => searchAnswer(text),
  commits: [] as CommitBody[],
  commitAnswer: async (body: CommitBody): Promise<Answer> => answerOf(body),
  uploads: [] as number[],
  uploadAnswer: async (mfcItemId: number): Promise<Answer> =>
    ok({ saved: "created", itemId: `item-${mfcItemId}`, mfcItemId }),
  orders: new Map<string, string>(),
  orderImages: new Map<string, readonly string[]>(),
  lists: [] as { readonly id: string; readonly title: string }[],
  createdLists: [] as string[],
};

export function resetServer() {
  server.releases.clear();
  server.pages.clear();
  server.items.clear();
  server.itemsFailure = null;
  server.itemsGate = null;
  server.searches.length = 0;
  server.search = async (text) => searchAnswer(text);
  server.commits.length = 0;
  server.commitAnswer = async (body) => answerOf(body);
  server.uploads.length = 0;
  server.uploadAnswer = async (mfcItemId) =>
    ok({ saved: "created", itemId: `item-${mfcItemId}`, mfcItemId });
  server.orders.clear();
  server.orderImages.clear();
  server.lists.length = 0;
  server.createdLists.length = 0;
}

await mock.module("@/lib/treaty-client", () => ({
  app: {
    api: {
      add: {
        items: {
          get: async ({ query }: { readonly query: { readonly ids: readonly string[] } }) => {
            await server.itemsGate;
            return (
              server.itemsFailure ??
              ok({
                items: query.ids.flatMap((id) => {
                  const item = server.items.get(id);
                  return item ? [item] : [];
                }),
              })
            );
          },
        },
        commit: {
          post: async (body: CommitBody) => {
            server.commits.push(body);
            return server.commitAnswer(body);
          },
        },
      },
      search: {
        items: {
          get: async ({ query }: { readonly query: { readonly query: string } }) => {
            server.searches.push(query.query);
            return server.search(query.query);
          },
        },
        orders: {
          get: async () =>
            ok({
              orderIdsAndTitles: [...server.orders].map(([id, title]) => ({
                id,
                title,
                images: server.orderImages.get(id) ?? [],
              })),
            }),
        },
      },
      orders: ({ orderId }: { readonly orderId: string }) => ({
        get: async () => {
          const title = server.orders.get(orderId);
          return title === undefined
            ? refused(404, "Order not found")
            : ok({
                orderId,
                title,
                status: "Ordered",
                images: server.orderImages.get(orderId) ?? [],
              });
        },
      }),
      item: ({ id }: { readonly id: string }) => ({
        releases: {
          get: async () => ok({ releases: server.releases.get(id) ?? [] }),
        },
      }),
      lists: {
        get: async () => ok({ items: server.lists, totalCount: server.lists.length }),
        post: async ({ title }: { readonly title: string }) => {
          server.createdLists.push(title);
          return ok({ id: `created-${server.createdLists.length}`, title });
        },
      },
      "mfc-items": {
        post: async ({ mfcItemId }: { readonly mfcItemId: number }) => {
          server.uploads.push(mfcItemId);
          return server.uploadAnswer(mfcItemId);
        },
      },
    },
  },
}));

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge = createExtensionBridge(extension.window, { picksAnswerMs: 50 });
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const { AddPage } = await import("@/components/add/add-page");
const { addSearchSchema } = await import("@/lib/add-search");

export function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window, { picksAnswerMs: 50 });
  return extension;
}

export const item = (itemId: string, overrides: Partial<AddItem> = {}): AddItem => ({
  itemId,
  externalId: 1000,
  title: `Figure ${itemId}`,
  image: null,
  category: "Prepainted",
  latestRelease: {
    id: `release-${itemId}`,
    date: "2027-01-15",
    type: "Standard",
    barcode: null,
    price: 500_000,
    priceCurrency: "USD",
  },
  collectionCount: 0,
  onOrderCount: 0,
  wishlisted: false,
  ...overrides,
});

export function seedItems(...items: readonly AddItem[]) {
  for (const seeded of items) server.items.set(seeded.itemId, seeded);
}

export const USER = {
  email: "collector@example.com",
  emailVerified: true,
  username: "collector",
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  hasSeenOnboarding: true,
};

function appRouter(entry: string, user: typeof USER, content: () => ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: "(app)",
    beforeLoad: () => ({ session: { user } }),
    component: Outlet,
  });
  const stub = (path: string) =>
    createRoute({
      getParentRoute: () => app,
      path,
      component: () => (
        <>
          <h1>{path}</h1>
          {server.pages.get(path)?.()}
        </>
      ),
    });
  const add = createRoute({
    getParentRoute: () => app,
    path: "/add",
    validateSearch: addSearchSchema,
    component: AddRoute,
  });
  function AddRoute() {
    const search = add.useSearch();
    return content() ?? <AddPage search={search} />;
  }
  return createRouter({
    routeTree: root.addChildren([
      app.addChildren([
        add,
        stub("/collection"),
        stub("/wishlist"),
        stub("/items"),
        stub("/lists"),
        stub("/lists/$listId"),
        stub("/orders"),
        stub("/orders/$id"),
        stub("/item/$externalId"),
        stub("/item/custom/$id"),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
}

function mount(router: ReturnType<typeof appRouter>, queryClient: QueryClient) {
  render(
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <RouterProvider router={router} />
      </Toaster>
    </QueryClientProvider>,
  );
  return router;
}

/** Opens the Add page at `entry`, such as `/add?to=collection`. */
export function openAddPage(entry = "/add", user: Partial<typeof USER> = {}) {
  return mount(
    appRouter(entry, { ...USER, ...user }, () => null),
    new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
}

/** Renders `ui` inside the app's route, for a component that needs a router and a session. */
export function renderInApp(ui: ReactNode, user: Partial<typeof USER> = {}) {
  return mount(
    appRouter("/add", { ...USER, ...user }, () => ui),
    new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
}
