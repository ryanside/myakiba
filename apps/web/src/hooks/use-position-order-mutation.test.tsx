import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { useEffect } from "react";
import { usePositionOrderMutation } from "./use-position-order-mutation";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

const server = {
  members: {} as Record<string, string[]>,
  fetches: [] as string[],
  heldSaves: [] as (() => void)[],
  failSaves: false,
  holdFetches: false,
  heldFetches: [] as (() => void)[],
};

const moves = new Map<string, (intent: PositionOrderInput) => Promise<void>>();

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
  server.holdFetches = false;
  server.heldFetches.length = 0;
  moves.clear();
});

function Members({ listId }: { listId: string }) {
  const queryKey = ["members", listId];
  const { data } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      server.fetches.push(listId);
      const items = (server.members[listId] ?? []).map((id) => ({ id }));
      if (server.holdFetches) {
        await new Promise<void>((resolve) => {
          server.heldFetches.push(resolve);
        });
      }
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
    moves.set(listId, mutation.move);
  }, [listId, mutation.move]);
  const ids = data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? [];
  return (
    <ul aria-label={`members of ${listId}`}>
      {ids.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}

function MemberCount({ listId }: { listId: string }) {
  const { data } = useQuery({
    queryKey: ["members", listId, "count"],
    queryFn: () => {
      server.fetches.push(`${listId} count`);
      return server.members[listId]?.length ?? 0;
    },
  });
  return <p aria-label={`count of ${listId}`}>{data}</p>;
}

const shownIn = (listId: string) =>
  [
    ...(screen.queryByRole("list", { name: `members of ${listId}` })?.querySelectorAll("li") ?? []),
  ].map((li) => li.textContent);

const fetchesOf = (listId: string) => server.fetches.filter((id) => id === listId).length;

function renderScreen(ui: (listId: string) => React.ReactNode, listId: string) {
  const queryClient = new QueryClient();
  const view = render(<QueryClientProvider client={queryClient}>{ui(listId)}</QueryClientProvider>);
  const show = (nextListId: string) =>
    view.rerender(<QueryClientProvider client={queryClient}>{ui(nextListId)}</QueryClientProvider>);
  const settled = () => waitFor(() => expect(queryClient.isFetching()).toBe(0));
  return { show, settled };
}

const renderMembers = (listId: string) => renderScreen((id) => <Members listId={id} />, listId);

function startMove(listId: string, intent: PositionOrderInput) {
  let saving: Promise<void> = Promise.resolve();
  act(() => {
    saving = (moves.get(listId)?.(intent) ?? Promise.resolve()).catch(() => {});
  });
  return saving;
}

async function saveNextMove(listId: string, intent: PositionOrderInput) {
  const saving = startMove(listId, intent);
  await waitFor(() => expect(server.heldSaves.length).toBeGreaterThan(0));
  await act(async () => {
    server.heldSaves.shift()?.();
    await saving;
  });
}

const cFirst: PositionOrderInput = { movedIds: ["c"], anchorId: "a", placement: "before" };
const aLast: PositionOrderInput = { movedIds: ["a"], anchorId: "b", placement: "after" };
const bFirst: PositionOrderInput = { movedIds: ["b"], anchorId: "a", placement: "before" };

describe("position order saves", () => {
  test("a list opened while another list's move is saving still refetches after its own moves", async () => {
    server.members = { first: ["a", "b", "c"], second: ["x", "y"] };
    const { show } = renderMembers("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));

    const firstSaving = startMove("first", cFirst);
    await waitFor(() => expect(server.heldSaves).toHaveLength(1));
    show("second");
    await waitFor(() => expect(shownIn("second")).toEqual(["x", "y"]));
    await act(async () => {
      server.heldSaves.shift()?.();
      await firstSaving;
    });

    show("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["c", "a", "b"]));
    const fetchesBeforeMove = fetchesOf("first");
    await saveNextMove("first", aLast);

    await waitFor(() => expect(fetchesOf("first")).toBe(fetchesBeforeMove + 1));
    expect(shownIn("first")).toEqual(["c", "b", "a"]);
  });

  test("a move on one list refetches that list while another list's move is still saving", async () => {
    server.members = { first: ["a", "b", "c"], second: ["x", "y", "z"] };
    const { settled } = renderScreen(
      () => (
        <>
          <Members listId="first" />
          <Members listId="second" />
        </>
      ),
      "",
    );
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));
    await waitFor(() => expect(shownIn("second")).toEqual(["x", "y", "z"]));

    const firstSaving = startMove("first", cFirst);
    await waitFor(() => expect(server.heldSaves).toHaveLength(1));
    const fetchesBeforeSecondMove = fetchesOf("second");
    const secondSaving = startMove("second", {
      movedIds: ["z"],
      anchorId: "x",
      placement: "before",
    });
    await waitFor(() => expect(server.heldSaves).toHaveLength(2));
    await act(async () => {
      server.heldSaves[1]?.();
      await secondSaving;
    });
    await settled();
    const secondRefetches = fetchesOf("second") - fetchesBeforeSecondMove;
    await act(async () => {
      server.heldSaves[0]?.();
      await firstSaving;
    });

    expect(secondRefetches).toBe(1);
    expect(shownIn("second")).toEqual(["z", "x", "y"]);
  });

  test("a saved move refetches only its own list", async () => {
    server.members = { first: ["a", "b", "c"], second: ["x", "y"] };
    const { settled } = renderScreen(
      () => (
        <>
          <Members listId="first" />
          <MemberCount listId="first" />
          <Members listId="second" />
        </>
      ),
      "",
    );
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));
    await waitFor(() => expect(shownIn("second")).toEqual(["x", "y"]));
    await waitFor(() => expect(screen.getByLabelText("count of first").textContent).toBe("3"));
    await settled();
    const fetchesBeforeMove = server.fetches.length;

    await saveNextMove("first", cFirst);
    await waitFor(() => expect(shownIn("first")).toEqual(["c", "a", "b"]));
    await settled();

    expect(server.fetches.slice(fetchesBeforeMove)).toEqual(["first"]);
  });

  test("a failed save shows the order it restored while the list refetches, then refetches once", async () => {
    server.members = { first: ["a", "b", "c"] };
    const { settled } = renderMembers("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));
    await settled();

    server.failSaves = true;
    server.holdFetches = true;
    const fetchesBeforeFailure = fetchesOf("first");
    const failing = startMove("first", cFirst);
    await waitFor(() => expect(shownIn("first")).toEqual(["c", "a", "b"]));
    act(() => {
      server.heldSaves.shift()?.();
    });
    await waitFor(() => expect(server.heldFetches).toHaveLength(1));
    const whileRefetching = shownIn("first");
    server.holdFetches = false;
    server.failSaves = false;
    await act(async () => {
      for (const release of server.heldFetches) release();
      await failing;
    });
    await settled();
    const fetchesFromFailure = fetchesOf("first") - fetchesBeforeFailure;

    await saveNextMove("first", cFirst);
    await waitFor(() => expect(fetchesOf("first")).toBe(fetchesBeforeFailure + 2));

    expect({ whileRefetching, fetchesFromFailure }).toEqual({
      whileRefetching: ["a", "b", "c"],
      fetchesFromFailure: 1,
    });
    expect(shownIn("first")).toEqual(["c", "a", "b"]);
  });

  test("a save that fails while another save is pending does not hide the order that saved", async () => {
    server.members = { first: ["a", "b", "c"] };
    renderMembers("first");
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));

    const failing = startMove("first", cFirst);
    const saving = startMove("first", bFirst);
    await waitFor(() => expect(server.heldSaves).toHaveLength(2));
    server.holdFetches = true;
    server.failSaves = true;
    act(() => {
      server.heldSaves[0]?.();
    });
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));
    server.failSaves = false;
    await act(async () => {
      server.heldSaves[1]?.();
      await saving;
    });
    server.holdFetches = false;
    await act(async () => {
      for (const release of server.heldFetches) release();
      await failing;
    });

    await waitFor(() => expect(shownIn("first")).toEqual(["b", "a", "c"]));
  });
});
