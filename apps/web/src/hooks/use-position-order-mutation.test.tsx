import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { useEffect } from "react";
import { usePositionOrderMutation } from "./use-position-order-mutation";

const server = {
  members: {} as Record<string, string[]>,
  fetches: [] as string[],
  heldSaves: [] as (() => void)[],
  failSaves: false,
};

function applyMove(listId: string, { movedIds, anchorId, placement }: PositionOrderInput) {
  const ids = server.members[listId] ?? [];
  const remaining = ids.filter((id) => !movedIds.includes(id));
  const insertionIndex = remaining.indexOf(anchorId ?? "") + (placement === "after" ? 1 : 0);
  server.members[listId] = [
    ...remaining.slice(0, insertionIndex),
    ...movedIds,
    ...remaining.slice(insertionIndex),
  ];
}

async function save(listId: string, intent: PositionOrderInput) {
  await new Promise<void>((resolve) => {
    server.heldSaves.push(resolve);
  });
  if (server.failSaves) throw new Error("save failed");
  applyMove(listId, intent);
}

afterEach(() => {
  cleanup();
  server.members = {};
  server.fetches.length = 0;
  server.heldSaves.length = 0;
  server.failSaves = false;
});

let move: (intent: PositionOrderInput) => Promise<void> = async () => {};

function Members({ listId }: { listId: string }) {
  const queryKey = ["members", listId];
  const { data } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      server.fetches.push(listId);
      const items = (server.members[listId] ?? []).map((id) => ({ id }));
      return { items, totalCount: items.length, limit: 50, offset: pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: () => {},
  });
  const mutation = usePositionOrderMutation({
    queryKey,
    persist: (intent) => save(listId, intent),
    failureTitle: "Failed to save the order",
  });
  useEffect(() => {
    move = mutation.move;
  }, [mutation.move]);
  const ids = data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? [];
  return (
    <ul aria-label={`members of ${listId}`}>
      {ids.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}

const shownIn = (listId: string) =>
  [
    ...(screen.queryByRole("list", { name: `members of ${listId}` })?.querySelectorAll("li") ?? []),
  ].map((li) => li.textContent);

const fetchesOf = (listId: string) => server.fetches.filter((id) => id === listId).length;

function renderMembers(listId: string) {
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Members listId={listId} />
    </QueryClientProvider>,
  );
  return (nextListId: string) =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Members listId={nextListId} />
      </QueryClientProvider>,
    );
}

async function saveNextMove(intent: PositionOrderInput) {
  let saving: Promise<void> = Promise.resolve();
  act(() => {
    saving = move(intent).catch(() => {});
  });
  await waitFor(() => expect(server.heldSaves.length).toBeGreaterThan(0));
  await act(async () => {
    server.heldSaves.shift()?.();
    await saving;
  });
}

const cFirst: PositionOrderInput = { movedIds: ["c"], anchorId: "a", placement: "before" };
const aLast: PositionOrderInput = { movedIds: ["a"], anchorId: "b", placement: "after" };

describe("position order saves", () => {
  test("a list opened while another list's move is saving still refetches after its own moves", async () => {
    server.members = { first: ["a", "b", "c"], second: ["x", "y"] };
    const showList = renderMembers("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));

    let firstSaving: Promise<void> = Promise.resolve();
    act(() => {
      firstSaving = move(cFirst);
    });
    await waitFor(() => expect(server.heldSaves).toHaveLength(1));
    showList("second");
    await waitFor(() => expect(shownIn("second")).toEqual(["x", "y"]));
    await act(async () => {
      server.heldSaves.shift()?.();
      await firstSaving;
    });

    showList("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["c", "a", "b"]));
    const fetchesBeforeMove = fetchesOf("first");
    await saveNextMove(aLast);

    await waitFor(() => expect(fetchesOf("first")).toBe(fetchesBeforeMove + 1));
    expect(shownIn("first")).toEqual(["c", "b", "a"]);
  });

  test("a failed save restores the order, refetches once, and the next save still refetches", async () => {
    server.members = { first: ["a", "b", "c"] };
    renderMembers("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));

    server.failSaves = true;
    const fetchesBeforeFailure = fetchesOf("first");
    await saveNextMove(cFirst);
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );
    const afterFailure = { shown: shownIn("first"), fetches: fetchesOf("first") };

    server.failSaves = false;
    await saveNextMove(cFirst);
    await waitFor(() => expect(fetchesOf("first")).toBe(afterFailure.fetches + 1));

    expect(afterFailure).toEqual({ shown: ["a", "b", "c"], fetches: fetchesBeforeFailure + 1 });
    expect(shownIn("first")).toEqual(["c", "a", "b"]);
  });

  test("a move rejected before saving refetches once and the pending move still lands", async () => {
    server.members = { first: ["a", "b", "c"] };
    renderMembers("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));

    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = move(cFirst);
    });
    await waitFor(() => expect(server.heldSaves).toHaveLength(1));
    const fetchesBeforeRejection = fetchesOf("first");
    await act(async () => {
      await move({ movedIds: ["missing"], anchorId: "a", placement: "before" }).catch(() => {});
    });
    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );
    const fetchesFromRejection = fetchesOf("first") - fetchesBeforeRejection;
    await act(async () => {
      server.heldSaves.shift()?.();
      await saving;
    });

    await waitFor(() => expect(shownIn("first")).toEqual(["c", "a", "b"]));
    expect(fetchesFromRejection).toBe(1);
  });
});
