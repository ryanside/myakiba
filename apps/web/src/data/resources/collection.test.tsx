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
import { useEffect, useSyncExternalStore } from "react";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { Saving } from "@/data/client";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { Result } from "better-result";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

type ServerItem = {
  readonly id: string;
  readonly itemTitle: string;
  readonly price: number;
  readonly paid: boolean;
};
type Write = {
  readonly name: string;
  readonly args: readonly unknown[];
  finish: () => void;
  fail: () => void;
};

const MIKU = { id: "co-miku", itemTitle: "Miku", price: 1000, paid: true };
const RIN = { id: "co-rin", itemTitle: "Rin", price: 500, paid: true };
const LEN = { id: "co-len", itemTitle: "Len", price: 200, paid: false };
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

const listPage = (items: readonly ServerItem[]) => {
  const totals = {
    totalCount: items.length,
    totalValue: items.reduce((sum, { price, paid }) => (paid ? sum + price : sum), 0),
    paidItemCount: items.filter(({ paid }) => paid).length,
    totalItemsThisMonth: 0,
  };
  return { items, ...totals };
};

const held =
  (name: string, apply: (...args: never[]) => void) =>
  (...args: never[]) =>
    new Promise((resolve) => {
      server.writes.push({
        name,
        args,
        finish: () => {
          apply(...args);
          resolve(Result.ok(null));
        },
        fail: () =>
          resolve(
            Result.err(
              new ApiServerError({
                status: 500,
                body: `${name} rejected by server`,
                message: `${name} rejected by server`,
              }),
            ),
          ),
      });
    });

await mock.module("@/queries/collection", () => ({
  getCollection: async (filters: CollectionFilters) => {
    server.listReads++;
    await server.heldReads;
    return Result.ok(
      listPage(server.items.filter((item) => item.itemTitle.includes(filters.search ?? ""))),
    );
  },

  deleteCollectionItems: held("delete", (ids: string[]) => {
    server.items = server.items.filter((item) => !ids.includes(item.id));
  }),
  updateCollectionItem: held("edit", (values: CollectionItemFormValues) => {
    server.items = server.items.map((item) =>
      item.id === values.id ? { ...item, price: values.price } : item,
    );
  }),
  fillCollectionItems: held("fill", (ids: string[], fill: ItemFill) => {
    if (fill.field !== "price") return;
    server.items = server.items.map((item) =>
      ids.includes(item.id) ? { ...item, price: fill.value } : item,
    );
  }),
}));
await mock.module("@/queries/orders", () => ({
  moveItem: held("assign", () => {}),
  splitOrders: held("assign new", () => {}),
}));

const url = { filters: {} as CollectionFilters, listeners: new Set<() => void>() };
const subscribe = (listener: () => void) => {
  url.listeners.add(listener);
  return () => url.listeners.delete(listener);
};
await mock.module("@/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: useSyncExternalStore(subscribe, () => url.filters),
    setFilters: async () => {},
    resetFilters: async () => {},
  }),
}));

const { toast } = await import("@/components/ui/toast");
const {
  useCollectionFilters,
  useCollectionMutations,
  useCollectionOrderMutations,
  useCollectionQuery,
} = await import("@/hooks/use-collection");

const toastAdd = spyOn(toast, "add");

afterEach(() => {
  cleanup();
  server.items = [MIKU, RIN, LEN];
  server.listReads = 0;
  server.heldReads = null;
  server.writes.length = 0;
  url.filters = {};
  toastAdd.mockClear();
});

type Actions = ReturnType<typeof useCollectionMutations>;

function renderCollectionPage(initialFilters: CollectionFilters) {
  url.filters = initialFilters;
  let actions: Actions | null = null;
  function CollectionPage() {
    const { filters } = useCollectionFilters();
    const { items, totalCount, totalValue, paidItemCount, averageItemCost } = useCollectionQuery();
    const mutations = useCollectionMutations({ filters });
    useEffect(() => {
      actions = mutations;
    });
    return (
      <>
        <p aria-label="totals">{`${totalCount} items worth ${totalValue}`}</p>
        <p aria-label="paid items">{paidItemCount}</p>
        <p aria-label="average cost">{averageItemCost}</p>
        <ul aria-label="collection">
          {items.map((item) => (
            <li key={item.id}>{`${item.itemTitle} ${item.price}`}</li>
          ))}
        </ul>
        <p aria-label="pending">
          {items
            .filter((item) => mutations.isCollectionPending(item.id))
            .map((item) => item.itemTitle)
            .join(",")}
        </p>
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
    filterTo: async (next: CollectionFilters) => {
      await act(async () => {
        url.filters = next;
        for (const listener of url.listeners) listener();
      });
    },
    act: (run: (current: Actions) => Saving) => {
      if (!actions) throw new Error("the collection page has not rendered");
      return run(actions).then((saved) => saved.status);
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
      totals: "3 items worth 1500",
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
  test("an unfiltered delete hides the items and lowers the totals by their paid prices before the server answers", async () => {
    const collection = renderCollectionPage({});
    await loaded();
    const readsBeforeWrite = server.listReads;

    const deleting = collection.act((actions) =>
      actions.handleDeleteCollectionItems(new Set([MIKU.id, LEN.id])),
    );
    await waitFor(() =>
      expect(shown()).toEqual({
        totals: "1 items worth 500",
        items: ["Rin 500"],
        itemPage: "",
      }),
    );

    await answer(0, "finish");
    expect(await deleting).toBe("ok");
    await waitFor(() => expect(server.listReads).toBe(readsBeforeWrite + 1));
    expect({ shown: shown(), toasts: toastTitles() }).toEqual({
      shown: { totals: "1 items worth 500", items: ["Rin 500"], itemPage: "" },
      toasts: ["success: Collection item(s) deleted"],
    });
  });

  test("an unfiltered delete lowers the paid item count before the server answers", async () => {
    const collection = renderCollectionPage({});
    await loaded();
    const paidItems = () => screen.getByLabelText("paid items").textContent;
    expect(paidItems()).toBe("2");

    const deleting = collection.act((actions) =>
      actions.handleDeleteCollectionItems(new Set([MIKU.id, LEN.id])),
    );
    await waitFor(() => expect(paidItems()).toBe("1"));

    await answer(0, "finish");
    expect(await deleting).toBe("ok");
    await waitFor(() => expect(paidItems()).toBe("1"));
  });

  test("Average Cost is the mean of the paid prices, before and after a delete", async () => {
    const collection = renderCollectionPage({});
    await loaded();
    const averageCost = () => screen.getByLabelText("average cost").textContent;
    expect(averageCost()).toBe("750");

    const deleting = collection.act((actions) =>
      actions.handleDeleteCollectionItems(new Set([MIKU.id, LEN.id])),
    );
    await waitFor(() => expect(averageCost()).toBe("500"));

    await answer(0, "finish");
    expect(await deleting).toBe("ok");
    await waitFor(() => expect(averageCost()).toBe("500"));
  });

  test("a failed edit restores the row and the Item page's copy and says so", async () => {
    const collection = renderCollectionPage({});
    await loaded();

    const editing = collection.act((actions) => actions.handleEditCollectionItem(mikuAt(1500)));
    await waitFor(() =>
      expect(shown()).toEqual({
        totals: "3 items worth 1500",
        items: ["Miku 1500", "Rin 500", "Len 200"],
        itemPage: "1500",
      }),
    );

    const releaseReads = holdListReads();
    await answer(0, "fail");
    await waitFor(() =>
      expect(shown()).toEqual({
        totals: "3 items worth 1500",
        items: ["Miku 1000", "Rin 500", "Len 200"],
        itemPage: "1000",
      }),
    );
    await releaseReads();
    expect({ settled: await editing, toasts: toastTitles() }).toEqual({
      settled: "error",
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
    expect(await editing).toBe("ok");
    await waitFor(() => expect(shown().items).toEqual(["Miku 1500", "Rin 500", "Len 200"]));
    expect(toastTitles()).toEqual(["success: Collection updated"]);
  });
});

describe("a fill on the collection page", () => {
  const FILL_PRICE: ItemFill = { field: "price", value: 1500 };
  const pending = () => screen.getByLabelText("pending").textContent;

  test("sends every selected id in one request and keeps the items pending through the refetch", async () => {
    const collection = renderCollectionPage({});
    await loaded();

    const filling = collection.act((actions) =>
      actions.handleFillCollectionItems(new Set([MIKU.id, "co-unloaded"]), FILL_PRICE),
    );
    await waitFor(() => expect(pending()).toBe("Miku"));
    expect(shown().items).toEqual(["Miku 1000", "Rin 500", "Len 200"]);

    const releaseReads = holdListReads();
    await answer(0, "finish");
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );
    expect(pending()).toBe("Miku");

    await releaseReads();
    expect(await filling).toBe("ok");
    expect({
      sent: server.writes.map(({ name, args }) => [name, ...args]),
      items: shown().items,
      pending: pending(),
      toasts: toastTitles(),
    }).toEqual({
      sent: [["fill", [MIKU.id, "co-unloaded"], FILL_PRICE]],
      items: ["Miku 1500", "Rin 500", "Len 200"],
      pending: "",
      toasts: ["loading: Filling collection items...", "success: Filled Price on 2 items"],
    });
  });

  test("marks the items pending under a filter too, and a failure shows the server's sentence", async () => {
    const collection = renderCollectionPage({ shop: ["AmiAmi"] });
    await loaded();

    const filling = collection.act((actions) =>
      actions.handleFillCollectionItems(new Set([RIN.id]), FILL_PRICE),
    );
    await waitFor(() => expect(pending()).toBe("Rin"));
    await answer(0, "fail");
    expect(await filling).toBe("error");
    expect({ items: shown().items, pending: pending(), toasts: toastTitles() }).toEqual({
      items: ["Miku 1000", "Rin 500", "Len 200"],
      pending: "",
      toasts: ["loading: Filling collection items...", "error: fill rejected by server"],
    });
  });
});

type CollectionHandlers = ReturnType<typeof useCollectionMutations> &
  ReturnType<typeof useCollectionOrderMutations>;
const HANDLERS: readonly (readonly [string, (h: CollectionHandlers) => Saving])[] = [
  ["handleEditCollectionItem", (h) => h.handleEditCollectionItem(mikuAt(1500))],
  ["handleDeleteCollectionItems", (h) => h.handleDeleteCollectionItems(new Set([MIKU.id]))],
  [
    "handleFillCollectionItems",
    (h) => h.handleFillCollectionItems(new Set([MIKU.id]), { field: "paid", value: true }),
  ],
  [
    "handleAddCollectionItemsToOrder",
    (h) => h.handleAddCollectionItemsToOrder("od-target", new Set([MIKU.id])),
  ],
  [
    "handleAddCollectionItemsToNewOrder",
    (h) => h.handleAddCollectionItemsToNewOrder({ title: "New" } as never, new Set([MIKU.id])),
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
    const call = run(handlers.current).then((saved) => saved.status);
    await answer(0, "fail");
    expect(await call).toBe("error");
  });
});

describe("a failed Collection Item write after the filter changes", () => {
  test("leaves the new list as the server sent it", async () => {
    const collection = renderCollectionPage({});
    await loaded();

    const deleting = collection.act((actions) =>
      actions.handleDeleteCollectionItems(new Set([LEN.id])),
    );
    await waitFor(() => expect(shown().items).toEqual(["Miku 1000", "Rin 500"]));
    await collection.filterTo({ search: "Rin" });
    await waitFor(() => expect(shown().items).toEqual(["Rin 500"]));

    const releaseReads = holdListReads();
    await answer(0, "fail");
    await waitFor(() =>
      expect(toastTitles()).toContain(
        "error: Failed to delete collection item(s). Please try again.",
      ),
    );
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );
    expect(shown()).toEqual({
      totals: "1 items worth 500",
      items: ["Rin 500"],
      itemPage: "1000",
    });

    await releaseReads();
    expect(await deleting).toBe("error");
  });
});
