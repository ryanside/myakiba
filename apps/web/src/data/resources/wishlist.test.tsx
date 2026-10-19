import { afterEach, describe, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import { act, cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import type { getErrorMessage as realGetErrorMessage } from "@/lib/treaty-client";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

type ServerItem = { id: string; itemId: string; title: string };

const MIKU = { id: "w1", itemId: "it-miku", title: "Hatsune Miku 1/7" };
const MEIKO = { id: "w2", itemId: "it-meiko", title: "MEIKO Pop Up Parade" };

const server = {
  items: [MIKU] as ServerItem[],
  wishlistGets: 0,
  holdWishlist: false,
  heldWishlist: [] as (() => void)[],
  failWrites: false,
};

const wishlistPage = () => ({
  items: server.items.map((item) => ({ ...item, latestRelease: null })),
  totalCount: server.items.length,
  limit: 25,
  offset: 0,
});

const write = (apply: () => void) => async () => {
  if (server.failWrites) return { data: null, error: { status: 500, value: "boom" } };
  apply();
  return { data: null, error: null };
};

const wishlistEndpoint = Object.assign(
  ({ itemId }: { itemId: string }) => ({
    put: write(() => {
      server.items = [...server.items, { ...MEIKO, itemId }];
    }),
    delete: write(() => {
      server.items = server.items.filter((item) => item.itemId !== itemId);
    }),
  }),
  {
    get: async () => {
      server.wishlistGets++;
      if (server.holdWishlist) {
        await new Promise<void>((resolve) => {
          server.heldWishlist.push(resolve);
        });
      }
      return { data: wishlistPage(), error: null };
    },
  },
);

const getErrorMessage: typeof realGetErrorMessage = (_error, fallback) => fallback;
await mock.module("@/lib/treaty-client", () => ({
  app: { api: { wishlist: wishlistEndpoint } },
  getErrorMessage,
  getUserErrorMessage: getErrorMessage,
}));

const { toast } = await import("@/components/ui/toast");
const { useResourceMutation } = await import("../client");
const { setWishlistMembership } = await import("./wishlist");
const { useWishlistItemsQuery } = await import("@/hooks/use-wishlist");

const toastAdd = spyOn(toast, "add");

afterEach(() => {
  cleanup();
  server.items = [MIKU];
  server.wishlistGets = 0;
  server.holdWishlist = false;
  server.heldWishlist.length = 0;
  server.failWrites = false;
  toastAdd.mockClear();
});

const membershipInput = { itemId: "it-meiko", itemExternalId: 1006, wishlisted: true };
const useMembership = () => useResourceMutation(setWishlistMembership);
type Run = ReturnType<typeof useMembership>["run"];
type Result = Awaited<ReturnType<Run>>;
type Outcome = { settled: Result | "pending" };

function renderWishlistWithToggle(queryClient: QueryClient) {
  let run: Run = async () => ({ kind: "failed", error: null });
  function Page() {
    const items = useWishlistItemsQuery("all");
    const mutation = useMembership();
    useEffect(() => {
      run = mutation.run;
    }, [mutation.run]);
    const titles = items.data?.pages.flatMap((page) => page.items.map((item) => item.title)) ?? [];
    return (
      <>
        <p role="status">{mutation.isPending ? "saving" : "idle"}</p>
        <ul aria-label="wishlist">
          {titles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      </>
    );
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>,
  );
  return (input: typeof membershipInput) => run(input);
}

const shown = () =>
  [...(screen.queryByRole("list", { name: "wishlist" })?.querySelectorAll("li") ?? [])].map(
    (li) => li.textContent,
  );

const itemPage = { externalId: 1006, title: "MEIKO Pop Up Parade", isWishlisted: false };

describe("adding an Item to the Wishlist", () => {
  test("stays saving until the open Wishlist refetch returns, then resolves saved", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["item", 1006], itemPage);
    const run = renderWishlistWithToggle(queryClient);
    await waitFor(() => expect(shown()).toEqual(["Hatsune Miku 1/7"]));

    server.holdWishlist = true;
    const outcome: Outcome = { settled: "pending" };
    act(() => {
      void run(membershipInput).then((result) => {
        outcome.settled = result;
      });
    });
    await waitFor(() => expect(server.heldWishlist).toHaveLength(1));
    const whileRefetching = {
      status: screen.getByRole("status").textContent,
      settled: outcome.settled,
    };

    await act(async () => server.heldWishlist[0]?.());
    await waitFor(() => expect(outcome.settled).not.toBe("pending"));

    expect({
      whileRefetching,
      settled: outcome.settled,
      status: screen.getByRole("status").textContent,
      shown: shown(),
      itemPage: queryClient.getQueryData(["item", 1006]),
      itemPageStale: queryClient.getQueryState(["item", 1006])?.isInvalidated,
      toasts: toastAdd.mock.calls.length,
    }).toEqual({
      whileRefetching: { status: "saving", settled: "pending" },
      settled: { kind: "saved", value: undefined },
      status: "idle",
      shown: ["Hatsune Miku 1/7", "MEIKO Pop Up Parade"],
      itemPage: { ...itemPage, isWishlisted: true },
      itemPageStale: true,
      toasts: 0,
    });
  });

  test("a failed write resolves failed, shows the error toast, and refetches nothing", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["item", 1006], itemPage);
    const run = renderWishlistWithToggle(queryClient);
    await waitFor(() => expect(shown()).toEqual(["Hatsune Miku 1/7"]));
    const getsBefore = server.wishlistGets;

    server.failWrites = true;
    let result: Result | undefined;
    await act(async () => {
      result = await run(membershipInput);
    });

    expect({
      kind: result?.kind,
      message: result?.kind === "failed" ? (result.error as Error).message : null,
      toasts: toastAdd.mock.calls.map(([options]) => options),
      refetches: server.wishlistGets - getsBefore,
      itemPage: queryClient.getQueryData(["item", 1006]),
      status: screen.getByRole("status").textContent,
    }).toEqual({
      kind: "failed",
      message: "Failed to add to Wishlist",
      toasts: [{ type: "error", title: "Failed to add to Wishlist" }],
      refetches: 0,
      itemPage,
      status: "idle",
    });
  });
});
