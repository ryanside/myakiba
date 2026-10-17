import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { useEffect } from "react";
import type { getErrorMessage as realGetErrorMessage } from "@/lib/treaty-client";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

type ServerList = { id: string; title: string };

const LISTS: ServerList[] = [
  { id: "l1", title: "Grails" },
  { id: "l2", title: "Preorders" },
  { id: "l3", title: "Shelf" },
];

const server = {
  lists: [...LISTS],
  listRequests: 0,
  heldOrderPatch: [] as (() => void)[],
  finishSync: () => {},
};

function applyMove({ movedIds, anchorId, placement }: PositionOrderInput) {
  const moved = server.lists.filter((list) => movedIds.includes(list.id));
  const remaining = server.lists.filter((list) => !movedIds.includes(list.id));
  const insertionIndex =
    remaining.findIndex((list) => list.id === anchorId) + (placement === "after" ? 1 : 0);
  server.lists = [
    ...remaining.slice(0, insertionIndex),
    ...moved,
    ...remaining.slice(insertionIndex),
  ];
}

const fakeApp = {
  api: {
    lists: {
      get: async ({ query }: { query: { limit: number; offset: number } }) => {
        server.listRequests += 1;
        const items = server.lists.map((list) => ({ ...list }));
        return {
          data: { items, totalCount: items.length, limit: query.limit, offset: query.offset },
          error: null,
        };
      },
      order: {
        patch: async (intent: PositionOrderInput) => {
          await new Promise<void>((resolve) => {
            server.heldOrderPatch.push(resolve);
          });
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
            yield {
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

const { useListsQuery, useMoveListsMutation } = await import("./use-lists");
const { useSyncJobStatusQuery } = await import("./use-sync-job-status-query");

afterEach(() => {
  cleanup();
  server.lists = [...LISTS];
  server.listRequests = 0;
  server.heldOrderPatch.length = 0;
});

describe("lists reorder", () => {
  test("a sync that finishes while a move is saving shows the saved order once the move saves", async () => {
    let move: (intent: PositionOrderInput) => Promise<void> = async () => {};
    function ListsOverview() {
      useSyncJobStatusQuery("job-1", "session-1", null);
      const { data } = useListsQuery();
      const mutation = useMoveListsMutation();
      useEffect(() => {
        move = mutation.move;
      }, [mutation.move]);
      const titles = data?.pages.flatMap((page) => page.items.map((list) => list.title)) ?? [];
      return (
        <ul aria-label="lists">
          {titles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      );
    }
    const shownLists = () =>
      [...(screen.queryByRole("list", { name: "lists" })?.querySelectorAll("li") ?? [])].map(
        (li) => li.textContent,
      );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ListsOverview />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(shownLists()).toEqual(["Grails", "Preorders", "Shelf"]));

    const shelfFirst: PositionOrderInput = {
      movedIds: ["l3"],
      anchorId: "l1",
      placement: "before",
    };
    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = move(shelfFirst);
    });
    await waitFor(() => expect(server.heldOrderPatch).toHaveLength(1));
    const requestsBeforeSync = server.listRequests;
    await act(async () => server.finishSync());
    await waitFor(() => expect(server.listRequests).toBeGreaterThan(requestsBeforeSync));
    await act(async () => {
      server.heldOrderPatch[0]?.();
      await saving;
    });

    await waitFor(() => expect(shownLists()).toEqual(["Shelf", "Grails", "Preorders"]));
  });
});
