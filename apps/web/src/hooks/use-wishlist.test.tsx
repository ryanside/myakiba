import { afterEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { useEffect } from "react";
import type { getErrorMessage as realGetErrorMessage } from "@/lib/treaty-client";

type WishlistQuery = { limit: number; offset: number; releaseStatus: string; today: string };
type ServerItem = { id: string; title: string; releaseDate: string };

const MIKU_BEFORE_SYNC = { id: "w1", title: "Miku (title before sync)", releaseDate: "2026-10-17" };

const server = {
  items: [MIKU_BEFORE_SYNC] as ServerItem[],
  wishlistRequests: [] as WishlistQuery[],
  orderPatches: [] as PositionOrderInput[],
  holdWishlist: false,
  heldWishlist: [] as (() => void)[],
  finishSync: () => {},
};

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
await mock.module("@/lib/treaty-client", () => ({ app: fakeApp, getErrorMessage }));
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
}));

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

function renderWithClient(ui: React.ReactNode, queryClient = new QueryClient()) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
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
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );

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
  test("moving an item in the All view shows the new order and saves it", async () => {
    server.items = [
      MIKU_BEFORE_SYNC,
      { id: "w2", title: "Kagamine Rin", releaseDate: "2026-11-01" },
      { id: "w3", title: "Kagamine Len", releaseDate: "2026-12-01" },
    ];
    let move: (intent: PositionOrderInput) => Promise<void> = async () => {};
    function ReorderableAll() {
      const mutation = useMoveWishlistItemsMutation();
      useEffect(() => {
        move = mutation.move;
      }, [mutation.move]);
      return <WishlistTab tab="all" />;
    }
    renderWithClient(<ReorderableAll />);
    await waitFor(() => expect(shownIn("wishlist all")).toHaveLength(3));

    const lenFirst: PositionOrderInput = { movedIds: ["w3"], anchorId: "w1", placement: "before" };
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
});
