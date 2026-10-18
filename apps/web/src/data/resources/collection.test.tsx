import { afterEach, describe, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import {
  act,
  cleanup,
  configure,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect } from "react";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

type ServerItem = { readonly id: string; readonly itemTitle: string; readonly price: number };
type Write = { readonly name: string; finish: () => void; fail: () => void };

const MIKU = { id: "co-miku", itemTitle: "Miku", price: 1000 };
const RIN = { id: "co-rin", itemTitle: "Rin", price: 500 };
const LEN = { id: "co-len", itemTitle: "Len", price: 200 };
const ITEM_PAGE_KEY = ["item", 1006, "itemRelatedCollection"];

const server = {
  items: [MIKU, RIN, LEN] as ServerItem[],
  listReads: 0,
  heldReads: null as Promise<void> | null,
  writes: [] as Write[],
};

function holdListReads() {
  let release = () => {};
  server.heldReads = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    server.heldReads = null;
    await act(async () => release());
  };
}

const listRow = (item: ServerItem) => ({
  ...item,
  totalCount: server.items.length,
  totalValue: server.items.reduce((sum, { price }) => sum + price, 0),
  totalItemsThisMonth: 0,
});

const held =
  (name: string, apply: (...args: never[]) => void) =>
  (...args: never[]): Promise<void> =>
    new Promise((resolve, reject) => {
      server.writes.push({
        name,
        finish: () => {
          apply(...args);
          resolve();
        },
        fail: () => reject(new Error(`${name} rejected by server`)),
      });
    });

await mock.module("@/queries/collection", () => ({
  getCollection: async () => {
    server.listReads++;
    await server.heldReads;
    return server.items.map(listRow);
  },
  deleteCollectionItems: held("delete", (ids: string[]) => {
    server.items = server.items.filter((item) => !ids.includes(item.id));
  }),
  updateCollectionItem: held("edit", (values: CollectionItemFormValues) => {
    server.items = server.items.map((item) =>
      item.id === values.id ? { ...item, price: values.price } : item,
    );
  }),
}));
await mock.module("@/queries/orders", () => ({
  moveItem: held("assign", () => {}),
  splitOrders: held("assign new", () => {}),
}));

const page = { filters: {} as CollectionFilters };
await mock.module("@/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: page.filters,
    setFilters: async () => {},
    resetFilters: async () => {},
  }),
}));

const { toast } = await import("@/components/ui/toast");
const { useCollectionMutations, useCollectionOrderMutations, useCollectionQuery } =
  await import("@/hooks/use-collection");

const toastAdd = spyOn(toast, "add");

afterEach(() => {
  cleanup();
  server.items = [MIKU, RIN, LEN];
  server.listReads = 0;
  server.heldReads = null;
  server.writes.length = 0;
  page.filters = {};
  toastAdd.mockClear();
});

type Actions = ReturnType<typeof useCollectionMutations>;

function renderCollectionPage(filters: CollectionFilters) {
  page.filters = filters;
  let actions: Actions | null = null;
  function CollectionPage() {
    const { items, totalCount, totalValue } = useCollectionQuery();
    const mutations = useCollectionMutations({ filters });
    useEffect(() => {
      actions = mutations;
    });
    return (
      <>
        <p aria-label="totals">{`${totalCount} items worth ${totalValue}`}</p>
        <ul aria-label="collection">
          {items.map((item) => (
            <li key={item.id}>{`${item.itemTitle} ${item.price}`}</li>
          ))}
        </ul>
      </>
    );
  }
  function ItemPageCopy() {
    const { data } = useQuery({
      queryKey: ITEM_PAGE_KEY,
      queryFn: async () => ({
        collection: server.items.filter((item) => item.id === MIKU.id),
      }),
    });
    return <p aria-label="item page">{data?.collection.map((item) => item.price).join(",")}</p>;
  }
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CollectionPage />
      <ItemPageCopy />
    </QueryClientProvider>,
  );
  return {
    act: (run: (current: Actions) => Promise<void>) => {
      if (!actions) throw new Error("the collection page has not rendered");
      return run(actions).then(
        () => "resolved",
        () => "rejected",
      );
    },
  };
}

const shown = () => ({
  totals: screen.getByLabelText("totals").textContent,
  items: [...screen.getByRole("list", { name: "collection" }).querySelectorAll("li")].map(
    (li) => li.textContent,
  ),
  itemPage: screen.getByLabelText("item page").textContent,
});

const loaded = () =>
  waitFor(() =>
    expect(shown()).toEqual({
      totals: "3 items worth 1700",
      items: ["Miku 1000", "Rin 500", "Len 200"],
      itemPage: "1000",
    }),
  );

async function answer(index: number, outcome: "finish" | "fail") {
  await waitFor(() => expect(server.writes.length).toBeGreaterThan(index));
  const write = server.writes[index];
  if (!write) throw new Error(`write ${index} never reached the server`);
  await act(async () => write[outcome]());
}

const toastTitles = () =>
  toastAdd.mock.calls.map(([options]) => `${options.type}: ${String(options.title)}`);

const mikuAt = (price: number) => ({ ...MIKU, price }) as CollectionItemFormValues;

describe("a Collection Item write on the collection page", () => {
  test("an unfiltered delete hides the items and lowers the totals before the server answers", async () => {
    const collection = renderCollectionPage({});
    await loaded();
    const readsBeforeWrite = server.listReads;

    const deleting = collection.act((actions) =>
      actions.handleDeleteCollectionItems(new Set([MIKU.id, LEN.id])),
    );
    await waitFor(() =>
      expect(shown()).toEqual({ totals: "1 items worth 500", items: ["Rin 500"], itemPage: "" }),
    );

    await answer(0, "finish");
    expect(await deleting).toBe("resolved");
    await waitFor(() => expect(server.listReads).toBe(readsBeforeWrite + 1));
    expect({ shown: shown(), toasts: toastTitles() }).toEqual({
      shown: { totals: "1 items worth 500", items: ["Rin 500"], itemPage: "" },
      toasts: ["success: Collection item(s) deleted"],
    });
  });

  test("a failed edit restores the row and the Item page's copy and says so", async () => {
    const collection = renderCollectionPage({});
    await loaded();

    const editing = collection.act((actions) => actions.handleEditCollectionItem(mikuAt(1500)));
    await waitFor(() =>
      expect(shown()).toEqual({
        totals: "3 items worth 1700",
        items: ["Miku 1500", "Rin 500", "Len 200"],
        itemPage: "1500",
      }),
    );

    const releaseReads = holdListReads();
    await answer(0, "fail");
    await waitFor(() =>
      expect(shown()).toEqual({
        totals: "3 items worth 1700",
        items: ["Miku 1000", "Rin 500", "Len 200"],
        itemPage: "1000",
      }),
    );
    await releaseReads();
    expect({ settled: await editing, toasts: toastTitles() }).toEqual({
      settled: "rejected",
      toasts: ["error: Failed to update collection item. Please try again."],
    });
  });

  test("a filtered edit leaves the list alone and still patches the Item page's copy", async () => {
    const collection = renderCollectionPage({ shop: ["AmiAmi"] });
    await loaded();

    const editing = collection.act((actions) => actions.handleEditCollectionItem(mikuAt(1500)));
    await waitFor(() => expect(shown().itemPage).toBe("1500"));
    expect(shown().items).toEqual(["Miku 1000", "Rin 500", "Len 200"]);

    await answer(0, "finish");
    expect(await editing).toBe("resolved");
    await waitFor(() => expect(shown().items).toEqual(["Miku 1500", "Rin 500", "Len 200"]));
    expect(toastTitles()).toEqual(["success: Collection updated"]);
  });
});

type CollectionHandlers = ReturnType<typeof useCollectionMutations> &
  ReturnType<typeof useCollectionOrderMutations>;
const HANDLERS: readonly (readonly [string, (h: CollectionHandlers) => Promise<void>])[] = [
  ["handleEditCollectionItem", (h) => h.handleEditCollectionItem(mikuAt(1500))],
  ["handleDeleteCollectionItems", (h) => h.handleDeleteCollectionItems(new Set([MIKU.id]))],
  [
    "handleAddCollectionItemsToOrder",
    (h) => h.handleAddCollectionItemsToOrder("od-target", new Set([MIKU.id])),
  ],
  [
    "handleAddCollectionItemsToNewOrder",
    (h) => h.handleAddCollectionItemsToNewOrder({ title: "New" } as never, [], new Set([MIKU.id])),
  ],
];

function renderHandlers() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => ({ ...useCollectionMutations(), ...useCollectionOrderMutations() }), {
    wrapper,
  }).result;
}

describe("a Collection Item action's promise settles with the server write", () => {
  test.each(HANDLERS)("%s: resolves after the write finishes", async (_name, run) => {
    const handlers = renderHandlers();
    let resumed = false;
    const call = run(handlers.current).then(() => {
      resumed = true;
    });
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(resumed).toBe(false);
    await answer(0, "finish");
    await call;
    expect(resumed).toBe(true);
  });

  test.each(HANDLERS)("%s: rejects when the write fails", async (_name, run) => {
    const handlers = renderHandlers();
    const call = run(handlers.current).then(
      () => "resolved",
      () => "rejected",
    );
    await answer(0, "fail");
    expect(await call).toBe("rejected");
  });
});
