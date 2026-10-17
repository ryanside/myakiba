import {
  afterEach,
  describe,
  expect,
  mock,
  setDefaultTimeout,
  setSystemTime,
  test,
} from "bun:test";
import { act, cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { useEffect } from "react";
import type { getErrorMessage as realGetErrorMessage } from "@/lib/treaty-client";
import { useToday } from "./use-today";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

type WishlistQuery = { limit: number; offset: number; releaseStatus: string; today: string };
type ServerItem = { id: string; title: string; releaseDate: string };

const MIKU_BEFORE_SYNC = { id: "w1", title: "Miku (title before sync)", releaseDate: "2026-10-17" };

const server = {
  items: [MIKU_BEFORE_SYNC] as ServerItem[],
  wishlistRequests: [] as WishlistQuery[],
  orderPatches: [] as PositionOrderInput[],
  holdWishlist: false,
  heldWishlist: [] as (() => void)[],
  holdOrderPatch: false,
  heldOrderPatch: [] as (() => void)[],
  finishSync: () => {},
};

function applyMove({ movedIds, anchorId, placement }: PositionOrderInput) {
  const moved = server.items.filter((item) => movedIds.includes(item.id));
  const remaining = server.items.filter((item) => !movedIds.includes(item.id));
  const insertionIndex =
    remaining.findIndex((item) => item.id === anchorId) + (placement === "after" ? 1 : 0);
  server.items = [
    ...remaining.slice(0, insertionIndex),
    ...moved,
    ...remaining.slice(insertionIndex),
  ];
}

function isInReleaseStatus(item: ServerItem, { releaseStatus, today }: WishlistQuery): boolean {
  if (releaseStatus === "upcoming") return item.releaseDate > today;
  if (releaseStatus === "available") return item.releaseDate <= today;
  return true;
}

function wishlistPage(query: WishlistQuery) {
  const items = server.items
    .filter((item) => isInReleaseStatus(item, query))
    .map((item) => ({ ...item, latestRelease: { date: item.releaseDate } }));
  return { items, totalCount: items.length, limit: query.limit, offset: query.offset };
}

const terminalChunk = {
  data: {
    jobId: "job-1",
    phase: "completed",
    statusMessage: "Sync completed.",
    progress: null,
    recentItems: [],
    error: null,
    startedAt: "2026-10-16T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:01.000Z",
    terminalState: "success",
  },
};

const fakeApp = {
  api: {
    wishlist: {
      get: async ({ query }: { query: WishlistQuery }) => {
        server.wishlistRequests.push(query);
        if (server.holdWishlist) {
          await new Promise<void>((resolve) => {
            server.heldWishlist.push(resolve);
          });
        }
        return { data: wishlistPage(query), error: null };
      },
      order: {
        patch: async (intent: PositionOrderInput) => {
          server.orderPatches.push(intent);
          if (server.holdOrderPatch) {
            await new Promise<void>((resolve) => {
              server.heldOrderPatch.push(resolve);
            });
          }
          applyMove(intent);
          return { data: null, error: null };
        },
      },
    },
    sync: {
      "job-status": {
        get: async () => ({
          data: (async function* stream() {
            await new Promise<void>((resolve) => {
              server.finishSync = resolve;
            });
            yield terminalChunk;
          })(),
          error: null,
        }),
      },
    },
  },
};

const getErrorMessage: typeof realGetErrorMessage = (_error, fallback) => fallback;
mock.module("@/lib/treaty-client", () => ({ app: fakeApp, getErrorMessage }));
const realRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({ ...realRouter, useNavigate: () => async () => {} }));

const { useMoveWishlistItemsMutation, useWishlistItemsQuery } = await import("./use-wishlist");
const { useSyncJobStatusQuery } = await import("./use-sync-job-status-query");

afterEach(() => {
  cleanup();
  setSystemTime();
  server.items = [MIKU_BEFORE_SYNC];
  server.wishlistRequests.length = 0;
  server.orderPatches.length = 0;
  server.holdWishlist = false;
  server.heldWishlist.length = 0;
  server.holdOrderPatch = false;
  server.heldOrderPatch.length = 0;
});

function WishlistTab({ tab }: { tab: "all" | "upcoming" | "available" }) {
  const { data, isPending } = useWishlistItemsQuery(tab);
  if (isPending) return <p>Loading wishlist</p>;
  const titles = data?.pages.flatMap((page) => page.items.map((item) => item.title)) ?? [];
  return (
    <ul aria-label={`wishlist ${tab}`}>
      {titles.map((title) => (
        <li key={title}>{title}</li>
      ))}
    </ul>
  );
}

function CollectionRow() {
  const { data } = useQuery({
    queryKey: ["collection", {}],
    queryFn: async () => server.items[0]?.title ?? "",
  });
  return <p aria-label="collection row">{data}</p>;
}

function SyncStatusWidget() {
  useSyncJobStatusQuery("job-1", "session-1", null);
  return null;
}

const shownIn = (label: string) =>
  [...(screen.queryByRole("list", { name: label })?.querySelectorAll("li") ?? [])].map(
    (li) => li.textContent,
  );

let renderedClient = new QueryClient();

function renderWithClient(ui: React.ReactNode, queryClient = new QueryClient()) {
  renderedClient = queryClient;
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const fetchesSettled = () => waitFor(() => expect(renderedClient.isFetching()).toBe(0));

function Today() {
  return <p aria-label="today">{useToday()}</p>;
}

describe("wishlist after a sync rewrites item metadata", () => {
  test("an open wishlist page shows the synced title once the sync finishes", async () => {
    renderWithClient(
      <>
        <SyncStatusWidget />
        <CollectionRow />
        <WishlistTab tab="all" />
      </>,
    );
    await waitFor(() => expect(shownIn("wishlist all")).toEqual(["Miku (title before sync)"]));

    server.items = [{ ...MIKU_BEFORE_SYNC, title: "Nendoroid Hatsune Miku" }];
    await act(async () => server.finishSync());
    await waitFor(() =>
      expect(screen.getByLabelText("collection row").textContent).toBe("Nendoroid Hatsune Miku"),
    );
    await fetchesSettled();

    expect({
      collection: screen.getByLabelText("collection row").textContent,
      wishlist: shownIn("wishlist all"),
    }).toEqual({
      collection: "Nendoroid Hatsune Miku",
      wishlist: ["Nendoroid Hatsune Miku"],
    });
  });
});

describe("wishlist release filters across midnight", () => {
  test("returning to Upcoming after the release date does not show the released item while refetching", async () => {
    const queryClient = new QueryClient();
    setSystemTime(new Date(2026, 9, 16, 23, 0));
    const first = renderWithClient(<WishlistTab tab="upcoming" />, queryClient);
    await waitFor(() => expect(shownIn("wishlist upcoming")).toEqual(["Miku (title before sync)"]));
    first.unmount();

    setSystemTime(new Date(2026, 9, 18, 9, 0));
    server.holdWishlist = true;
    renderWithClient(<WishlistTab tab="upcoming" />, queryClient);
    await waitFor(() => expect(server.heldWishlist).toHaveLength(1));
    const whileRefetching = screen.queryByText("Loading wishlist")
      ? "loading"
      : shownIn("wishlist upcoming");
    await act(async () => server.heldWishlist[0]?.());
    await waitFor(() => expect(shownIn("wishlist upcoming")).toEqual([]));

    expect({
      todaySent: server.wishlistRequests.map((request) => request.today),
      whileRefetching,
    }).toEqual({
      todaySent: ["2026-10-16", "2026-10-18"],
      whileRefetching: "loading",
    });
  });

  test("an Upcoming page left open drops the item at local midnight on its release date", async () => {
    setSystemTime(new Date(2026, 9, 16, 23, 59, 59, 900));
    renderWithClient(<WishlistTab tab="upcoming" />);
    await waitFor(() => expect(shownIn("wishlist upcoming")).toEqual(["Miku (title before sync)"]));

    setSystemTime(new Date(2026, 9, 17, 0, 0, 1));
    await waitFor(() => expect(shownIn("wishlist upcoming")).toEqual([]));

    expect(server.wishlistRequests.map((request) => request.today)).toEqual([
      "2026-10-16",
      "2026-10-17",
    ]);
  });

  test("an Upcoming page left open for days shows the new split when the tab becomes visible", async () => {
    setSystemTime(new Date(2026, 9, 16, 9, 0));
    renderWithClient(<WishlistTab tab="upcoming" />);
    await waitFor(() => expect(shownIn("wishlist upcoming")).toEqual(["Miku (title before sync)"]));

    setSystemTime(new Date(2026, 9, 18, 9, 0));
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(shownIn("wishlist upcoming")).toEqual([]));
  });
});

describe("wishlist reorder", () => {
  const KAGAMINE_RIN = { id: "w2", title: "Kagamine Rin", releaseDate: "2026-11-01" };
  const KAGAMINE_LEN = { id: "w3", title: "Kagamine Len", releaseDate: "2026-12-01" };
  const lenFirst: PositionOrderInput = { movedIds: ["w3"], anchorId: "w1", placement: "before" };

  function renderReorderableAll(extra?: React.ReactNode) {
    let move: (intent: PositionOrderInput) => Promise<void> = async () => {};
    function ReorderableAll() {
      const mutation = useMoveWishlistItemsMutation();
      useEffect(() => {
        move = mutation.move;
      }, [mutation.move]);
      return (
        <>
          <p role="status">{mutation.isPending ? "saving" : "idle"}</p>
          <WishlistTab tab="all" />
        </>
      );
    }
    renderWithClient(
      <>
        {extra}
        <ReorderableAll />
      </>,
    );
    return (intent: PositionOrderInput) => move(intent);
  }

  test("moving an item in the All view shows the new order and saves it", async () => {
    server.items = [MIKU_BEFORE_SYNC, KAGAMINE_RIN, KAGAMINE_LEN];
    const move = renderReorderableAll();
    await waitFor(() => expect(shownIn("wishlist all")).toHaveLength(3));

    await act(() => move(lenFirst));

    await waitFor(() =>
      expect(shownIn("wishlist all")).toEqual([
        "Kagamine Len",
        "Miku (title before sync)",
        "Kagamine Rin",
      ]),
    );
    expect(server.orderPatches).toEqual([lenFirst]);
  });

  test("a second move made while the first is saving stays in place when the first save finishes", async () => {
    server.items = [MIKU_BEFORE_SYNC, KAGAMINE_RIN, KAGAMINE_LEN];
    const move = renderReorderableAll();
    await waitFor(() => expect(shownIn("wishlist all")).toHaveLength(3));

    server.holdOrderPatch = true;
    const mikuLast: PositionOrderInput = { movedIds: ["w1"], anchorId: "w2", placement: "after" };
    let savingBoth: Promise<unknown> = Promise.resolve();
    act(() => {
      savingBoth = Promise.all([move(lenFirst), move(mikuLast)]);
    });
    await waitFor(() => expect(server.heldOrderPatch).toHaveLength(2));
    await act(async () => server.heldOrderPatch[0]?.());
    await fetchesSettled();
    const afterFirstSave = shownIn("wishlist all");
    await act(async () => {
      server.heldOrderPatch[1]?.();
      await savingBoth;
    });

    expect({ afterFirstSave, afterBothSaves: shownIn("wishlist all") }).toEqual({
      afterFirstSave: ["Kagamine Len", "Kagamine Rin", "Miku (title before sync)"],
      afterBothSaves: ["Kagamine Len", "Kagamine Rin", "Miku (title before sync)"],
    });
  });

  test("a move that saves across local midnight keeps its order", async () => {
    setSystemTime(new Date(2026, 9, 16, 23, 59, 59, 800));
    server.items = [MIKU_BEFORE_SYNC, KAGAMINE_RIN, KAGAMINE_LEN];
    const move = renderReorderableAll(<Today />);
    await waitFor(() => expect(shownIn("wishlist all")).toHaveLength(3));

    server.holdOrderPatch = true;
    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = move(lenFirst);
    });
    await waitFor(() => expect(server.heldOrderPatch).toHaveLength(1));
    const requestsBeforeMidnight = server.wishlistRequests.length;
    setSystemTime(new Date(2026, 9, 17, 0, 0, 1));
    await waitFor(() => expect(screen.getByLabelText("today").textContent).toBe("2026-10-17"));
    await fetchesSettled();
    const afterMidnight = {
      shown: shownIn("wishlist all"),
      requests: server.wishlistRequests.length - requestsBeforeMidnight,
    };
    await act(async () => {
      server.heldOrderPatch[0]?.();
      await saving;
    });

    expect(afterMidnight).toEqual({
      shown: ["Kagamine Len", "Miku (title before sync)", "Kagamine Rin"],
      requests: 0,
    });
    await waitFor(() =>
      expect(shownIn("wishlist all")).toEqual([
        "Kagamine Len",
        "Miku (title before sync)",
        "Kagamine Rin",
      ]),
    );
  });

  test("a move stops saving when its save finishes, before the refetch returns", async () => {
    server.items = [MIKU_BEFORE_SYNC, KAGAMINE_RIN, KAGAMINE_LEN];
    const move = renderReorderableAll();
    await waitFor(() => expect(shownIn("wishlist all")).toHaveLength(3));

    server.holdOrderPatch = true;
    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = move(lenFirst);
    });
    await waitFor(() => expect(server.heldOrderPatch).toHaveLength(1));
    server.holdWishlist = true;
    await act(async () => server.heldOrderPatch[0]?.());
    await waitFor(() => expect(server.heldWishlist).toHaveLength(1));
    const whileRefetching = screen.getByRole("status").textContent;
    await act(async () => {
      server.heldWishlist[0]?.();
      await saving;
    });

    expect(whileRefetching).toBe("idle");
  });

  test("two saves that finish together after a sync show the saved order", async () => {
    server.items = [MIKU_BEFORE_SYNC, KAGAMINE_RIN, KAGAMINE_LEN];
    const move = renderReorderableAll(<SyncStatusWidget />);
    await waitFor(() => expect(shownIn("wishlist all")).toHaveLength(3));

    server.holdOrderPatch = true;
    const mikuLast: PositionOrderInput = { movedIds: ["w1"], anchorId: "w2", placement: "after" };
    let savingBoth: Promise<unknown> = Promise.resolve();
    act(() => {
      savingBoth = Promise.all([move(lenFirst), move(mikuLast)]);
    });
    await waitFor(() => expect(server.heldOrderPatch).toHaveLength(2));
    const requestsBeforeSync = server.wishlistRequests.length;
    await act(async () => server.finishSync());
    await waitFor(() => expect(server.wishlistRequests.length).toBeGreaterThan(requestsBeforeSync));
    const requestsBeforeSaves = server.wishlistRequests.length;
    await act(async () => {
      server.heldOrderPatch[0]?.();
      server.heldOrderPatch[1]?.();
      await savingBoth;
    });

    await waitFor(() =>
      expect(shownIn("wishlist all")).toEqual([
        "Kagamine Len",
        "Kagamine Rin",
        "Miku (title before sync)",
      ]),
    );
    expect(server.wishlistRequests.length - requestsBeforeSaves).toBe(1);
  });

  test("a sync that finishes while a move is saving shows the saved order once the move saves", async () => {
    server.items = [MIKU_BEFORE_SYNC, KAGAMINE_RIN, KAGAMINE_LEN];
    const move = renderReorderableAll(<SyncStatusWidget />);
    await waitFor(() => expect(shownIn("wishlist all")).toHaveLength(3));

    server.holdOrderPatch = true;
    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = move(lenFirst);
    });
    await waitFor(() => expect(server.heldOrderPatch).toHaveLength(1));
    const requestsBeforeSync = server.wishlistRequests.length;
    await act(async () => server.finishSync());
    await waitFor(() => expect(server.wishlistRequests.length).toBeGreaterThan(requestsBeforeSync));
    await act(async () => {
      server.heldOrderPatch[0]?.();
      await saving;
    });

    await waitFor(() =>
      expect(shownIn("wishlist all")).toEqual([
        "Kagamine Len",
        "Miku (title before sync)",
        "Kagamine Rin",
      ]),
    );
  });
});
