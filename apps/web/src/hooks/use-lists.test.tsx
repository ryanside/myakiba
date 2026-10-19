import { afterEach, describe, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
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
  members: {} as Record<string, string[]>,
  fetches: [] as string[],
  heldSaves: [] as (() => void)[],
  failSaves: false,
  holdFetches: false,
  heldFetches: [] as (() => void)[],
  writes: [] as string[],
  failWrites: false,
};

const written = async <Data,>(label: string, data: Data) => {
  server.writes.push(label);
  return server.failWrites
    ? { data: null, error: { status: 500, value: `${label} failed` } }
    : { data, error: null };
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

function applyMemberMove(listId: string, { movedIds, anchorId, placement }: PositionOrderInput) {
  const ids = server.members[listId] ?? [];
  const remaining = ids.filter((id) => !movedIds.includes(id));
  const insertionIndex = remaining.indexOf(anchorId ?? "") + (placement === "after" ? 1 : 0);
  server.members[listId] = [
    ...remaining.slice(0, insertionIndex),
    ...movedIds,
    ...remaining.slice(insertionIndex),
  ];
}

const listEndpoint = ({ listId }: { listId: string }) => ({
  put: async (input: { title: string }) => written(`update ${listId}`, { id: listId, ...input }),
  get: async () => {
    server.fetches.push(`${listId} detail`);
    return {
      data: { id: listId, title: listId, description: "" },
      error: null,
    };
  },
  members: {
    delete: async ({ memberIds }: { memberIds: string[] }) =>
      written(`remove ${memberIds.join(",")} from ${listId}`, null),
    get: async ({ query }: { query: { limit: number; offset: number } }) => {
      server.fetches.push(listId);
      const items = (server.members[listId] ?? []).map((id) => ({ id }));
      if (server.holdFetches) {
        await new Promise<void>((resolve) => {
          server.heldFetches.push(resolve);
        });
      }
      return {
        data: { items, totalCount: items.length, limit: query.limit, offset: query.offset },
        error: null,
      };
    },
    order: {
      patch: async (intent: PositionOrderInput) => {
        await new Promise<void>((resolve) => {
          server.heldSaves.push(resolve);
        });
        if (server.failSaves) return { data: null, error: { status: 500, value: "save failed" } };
        applyMemberMove(listId, intent);
        return { data: null, error: null };
      },
    },
  },
});

const fakeApp = {
  api: {
    lists: Object.assign(listEndpoint, {
      post: async (input: { title: string }) => written(`create ${input.title}`, { id: "l9" }),
      delete: async ({ listIds }: { listIds: string[] }) =>
        written(`delete ${listIds.join(",")}`, null),
      targets: {
        options: {
          post: async () => {
            server.fetches.push("options");
            return { data: { lists: [] }, error: null };
          },
        },
        put: async ({ listIds }: { listIds: string[] }) =>
          written(`add to ${listIds.join(",")}`, { addedCount: listIds.length }),
        delete: async ({ listId }: { listId: string }) =>
          written(`remove target from ${listId}`, { removedCount: 1 }),
      },
      get: async ({ query }: { query: { limit: number; offset: number } }) => {
        server.listRequests += 1;
        server.fetches.push("overview");
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
    }),
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
await mock.module("@/lib/treaty-client", () => ({
  app: fakeApp,
  getErrorMessage,
  getUserErrorMessage: getErrorMessage,
}));
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
}));

const {
  useAddTargetsToListsMutation,
  useListMembersQuery,
  useListMutations,
  useListOptionsForTargetsQuery,
  useListQuery,
  useListsQuery,
  useMoveListMembersMutation,
  useMoveListsMutation,
  useRemoveListMembersMutation,
  useRemoveTargetsFromListMutation,
} = await import("./use-lists");
const { toast } = await import("@/components/ui/toast");
const toastAdd = spyOn(toast, "add");
const { useSyncJobStatusQuery } = await import("./use-sync-job-status-query");

const moves = new Map<string, (intent: PositionOrderInput) => Promise<void>>();

afterEach(() => {
  cleanup();
  server.lists = [...LISTS];
  server.listRequests = 0;
  server.heldOrderPatch.length = 0;
  server.members = {};
  server.fetches.length = 0;
  server.heldSaves.length = 0;
  server.failSaves = false;
  server.holdFetches = false;
  server.heldFetches.length = 0;
  server.writes.length = 0;
  server.failWrites = false;
  toastAdd.mockClear();
  moves.clear();
  currentActions = undefined;
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

function Members({ listId }: { listId: string }) {
  const { data } = useListMembersQuery(listId);
  const mutation = useMoveListMembersMutation(listId);
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

function ListTitle({ listId }: { listId: string }) {
  const { data } = useListQuery(listId);
  return <p aria-label={`title of ${listId}`}>{data?.title}</p>;
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
          <ListTitle listId="first" />
          <Members listId="second" />
        </>
      ),
      "",
    );
    await waitFor(() => expect(shownIn("first")).toEqual(["a", "b", "c"]));
    await waitFor(() => expect(shownIn("second")).toEqual(["x", "y"]));
    await waitFor(() => expect(screen.getByLabelText("title of first").textContent).toBe("first"));
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

const TARGETS = [{ type: "item", id: "i1" }] as const;

function useListActions() {
  useListsQuery();
  useListQuery("l1");
  useListMembersQuery("l1");
  useListOptionsForTargetsQuery([...TARGETS], true);
  return {
    lists: useListMutations(),
    quietLists: useListMutations({ showCreateErrorToast: false }),
    add: useAddTargetsToListsMutation(),
    removeTarget: useRemoveTargetsFromListMutation([...TARGETS]),
    removeMembers: useRemoveListMembersMutation("l1"),
  };
}

type ListActions = ReturnType<typeof useListActions>;

type WriteResult = {
  readonly outcome: "resolved" | "rejected";
  readonly writes: readonly string[];
  readonly toasts: readonly string[];
  readonly refetchedBeforeResolve: readonly string[];
  readonly refetched: readonly string[];
};

let currentActions: ListActions | undefined;

function ListScreens() {
  const actions = useListActions();
  useEffect(() => {
    currentActions = actions;
  });
  return null;
}

async function writeToLists(write: (actions: ListActions) => Promise<void>): Promise<WriteResult> {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ListScreens />
    </QueryClientProvider>,
  );
  const settled = () => waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
  await settled();
  server.fetches.length = 0;
  toastAdd.mockClear();
  let outcome: WriteResult["outcome"] = "resolved";
  await act(async () => {
    const actions = currentActions;
    if (!actions) throw new Error("the list screens did not render");
    await write(actions).catch(() => {
      outcome = "rejected";
    });
  });
  const refetchedBeforeResolve = [...server.fetches].toSorted();
  await settled();
  return {
    outcome,
    writes: [...server.writes],
    toasts: toastAdd.mock.calls.map(([options]) =>
      [options.type, options.title, options.actionProps?.children].filter(Boolean).join(": "),
    ),
    refetchedBeforeResolve,
    refetched: [...server.fetches].toSorted(),
  };
}

const LIST_WRITES: readonly {
  readonly name: string;
  readonly run: (actions: ListActions) => Promise<void>;
  readonly saved: WriteResult;
  readonly failed: WriteResult;
}[] = [
  {
    name: "create a List",
    run: async ({ lists }) => {
      await lists.createList({ title: "Shelf", description: "" });
    },
    saved: {
      outcome: "resolved",
      writes: ["create Shelf"],
      toasts: ["success: List created: Open List"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["create Shelf"],
      toasts: ["error: Failed to create list"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "create a List from the add dialog",
    run: async ({ quietLists }) => {
      await quietLists.createList({ title: "Shelf", description: "" });
    },
    saved: {
      outcome: "resolved",
      writes: ["create Shelf"],
      toasts: ["success: List created: Open List"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["create Shelf"],
      toasts: [],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "update a List",
    run: async ({ lists }) => {
      await lists.updateList({ listId: "l1", title: "Grails 2", description: "" });
    },
    saved: {
      outcome: "resolved",
      writes: ["update l1"],
      toasts: ["success: List updated"],
      refetchedBeforeResolve: ["l1 detail", "options", "overview"],
      refetched: ["l1 detail", "options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["update l1"],
      toasts: ["error: Failed to update list"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "delete a List",
    run: async ({ lists }) => {
      await lists.deleteList("l1");
    },
    saved: {
      outcome: "resolved",
      writes: ["delete l1"],
      toasts: ["success: List deleted"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["l1", "l1 detail", "options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["delete l1"],
      toasts: ["error: Failed to delete List"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "delete two Lists",
    run: async ({ lists }) => {
      await lists.deleteLists(new Set(["l1", "l2"]));
    },
    saved: {
      outcome: "resolved",
      writes: ["delete l1,l2"],
      toasts: ["success: 2 Lists deleted"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["l1", "l1 detail", "options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["delete l1,l2"],
      toasts: ["error: Failed to delete Lists"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "add an Item to two Lists",
    run: async ({ add }) => {
      await add.mutateAsync({ targets: [...TARGETS], listIds: ["l1", "l2"] });
    },
    saved: {
      outcome: "resolved",
      writes: ["add to l1,l2"],
      toasts: ["success: 1 Item added to 2 Lists: Open Lists"],
      refetchedBeforeResolve: ["l1", "options", "overview"],
      refetched: ["l1", "options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["add to l1,l2"],
      toasts: [],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "remove an Item from a List",
    run: async ({ removeTarget }) => {
      await removeTarget.mutateAsync("l1");
    },
    saved: {
      outcome: "resolved",
      writes: ["remove target from l1"],
      toasts: [],
      refetchedBeforeResolve: ["l1", "options", "overview"],
      refetched: ["l1", "options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["remove target from l1"],
      toasts: [],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "remove members from a List",
    run: async ({ removeMembers }) => {
      await removeMembers.mutateAsync(["m1", "m2"]);
    },
    saved: {
      outcome: "resolved",
      writes: ["remove m1,m2 from l1"],
      toasts: ["success: 2 removed from List"],
      refetchedBeforeResolve: ["l1", "options", "overview"],
      refetched: ["l1", "options", "overview"],
    },
    failed: {
      outcome: "rejected",
      writes: ["remove m1,m2 from l1"],
      toasts: ["error: Failed to remove from List"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
];

describe("list writes", () => {
  for (const { name, run, saved, failed } of LIST_WRITES) {
    test(`${name}: what the write shows and refetches`, async () => {
      expect(await writeToLists(run)).toEqual(saved);
    });

    test(`${name}: what a failed write shows and refetches`, async () => {
      server.failWrites = true;
      expect(await writeToLists(run)).toEqual(failed);
    });
  }
});
