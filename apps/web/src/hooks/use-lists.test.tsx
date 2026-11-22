import { afterEach, describe, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { Panic, Result } from "better-result";
import { useEffect, useRef } from "react";
import type { Saving } from "@/data/client";

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
  finishRefresh: () => {},
  members: {} as Record<string, string[]>,
  fetches: [] as string[],
  heldSaves: [] as (() => void)[],
  failSaves: false,
  holdFetches: false,
  heldFetches: [] as (() => void)[],
  writes: [] as string[],
  failWrites: false,
  removeFailure: null as { status: number; value: string } | null,
  holdRemoves: false,
  heldRemoves: [] as (() => void)[],
  restoreFailures: [] as { status: number; value: string }[],
  restoreDefect: false,
  heldRestores: [] as (() => void)[],
  holdRestores: false,
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
    delete: async ({ memberIds }: { memberIds: string[] }) => {
      if (server.holdRemoves) {
        await new Promise<void>((resolve) => {
          server.heldRemoves.push(resolve);
        });
      }
      if (server.removeFailure) {
        server.writes.push(`remove ${memberIds.join(",")} from ${listId}`);
        return { data: null, error: server.removeFailure };
      }
      return written(`remove ${memberIds.join(",")} from ${listId}`, {
        removedCount: memberIds.length,
        removed: memberIds.map((id, index) => ({
          type: "item",
          id: `item-${id}`,
          position: index,
        })),
      });
    },
    restore: {
      post: async ({ members }: { members: { type: string; id: string; position: number }[] }) => {
        server.writes.push(
          `restore ${members.map(({ id, position }) => `${id}@${position}`).join(",")} to ${listId}`,
        );
        if (server.holdRestores) {
          await new Promise<void>((resolve) => {
            server.heldRestores.push(resolve);
          });
        }
        if (server.restoreDefect) throw new Panic({ message: "restore answer could not be read" });
        const failure = server.restoreFailures.shift();
        return failure
          ? { data: null, error: failure }
          : { data: { restoredCount: members.length }, error: null };
      },
    },
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
  },
};

const getErrorMessage = (_error: { readonly status: number }, fallback: string) => fallback;
await mock.module("@/lib/treaty-client", () => ({
  app: fakeApp,
  getErrorMessage,
  getUserErrorMessage: getErrorMessage,
}));
const realRefresh = await import("@/data/item-refresh");
await mock.module("@/data/item-refresh", () => ({
  ...realRefresh,
  refreshItemWithExtension: () =>
    new Promise((resolve) => {
      server.finishRefresh = () => resolve(Result.ok({ saved: "refreshed" }));
    }),
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
const { toast, Toaster } = await import("@/components/ui/toast");
const toastAdd = spyOn(toast, "add");
const toastUpdate = spyOn(toast, "update");
const { refreshItemCommand } = await import("@/data/resources/item");
const { useResourceMutation } = await import("@/data/client");

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
  server.removeFailure = null;
  server.holdRemoves = false;
  server.heldRemoves.length = 0;
  server.restoreFailures.length = 0;
  server.restoreDefect = false;
  server.heldRestores.length = 0;
  server.holdRestores = false;
  toastAdd.mockClear();
  toastUpdate.mockClear();
  moves.clear();
  currentActions = undefined;
});

/** An Item Refresh in flight from the moment this mounts, until the test finishes it. */
function ItemRefresh() {
  const { run } = useResourceMutation(refreshItemCommand);
  const start = useRef(run);
  useEffect(() => {
    void start.current(98_777);
  }, []);
  return null;
}

describe("lists reorder", () => {
  test("an Item Refresh that finishes while a move is saving shows the saved order once the move saves", async () => {
    let move: (intent: PositionOrderInput) => Promise<void> = async () => {};
    function ListsOverview() {
      const { data } = useListsQuery();
      const mutation = useMoveListsMutation();
      const moveOrder = mutation.move;
      useEffect(() => {
        move = async (intent) => {
          await moveOrder(intent);
        };
      }, [moveOrder]);
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
        <ItemRefresh />
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
    const requestsBeforeRefresh = server.listRequests;
    await act(async () => server.finishRefresh());
    await waitFor(() => expect(server.listRequests).toBeGreaterThan(requestsBeforeRefresh));
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
  const moveOrder = mutation.move;
  useEffect(() => {
    moves.set(listId, async (intent) => {
      await moveOrder(intent);
    });
  }, [listId, moveOrder]);
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
    removeMembersFromPreorders: useRemoveListMembersMutation("l2"),
  };
}

type ListActions = ReturnType<typeof useListActions>;

type WriteResult = {
  readonly outcome: "ok" | "error";
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

async function writeToLists(write: (actions: ListActions) => Saving): Promise<WriteResult> {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <ListScreens />
      </Toaster>
    </QueryClientProvider>,
  );
  const settled = () => waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
  await settled();
  server.fetches.length = 0;
  toastAdd.mockClear();
  let outcome: WriteResult["outcome"] = "ok";
  await act(async () => {
    const actions = currentActions;
    if (!actions) throw new Error("the list screens did not render");
    const saved = await write(actions);
    outcome = saved.status;
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
  readonly run: (actions: ListActions) => Saving;
  readonly saved: WriteResult;
  readonly failed: WriteResult;
}[] = [
  {
    name: "create a List",
    run: ({ lists }) => lists.createList({ title: "Shelf", description: "" }),
    saved: {
      outcome: "ok",
      writes: ["create Shelf"],
      toasts: ["success: List created: Open List"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["create Shelf"],
      toasts: ["error: Failed to create list"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "create a List from the add dialog",
    run: ({ quietLists }) => quietLists.createList({ title: "Shelf", description: "" }),
    saved: {
      outcome: "ok",
      writes: ["create Shelf"],
      toasts: ["success: List created: Open List"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["create Shelf"],
      toasts: [],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "update a List",
    run: ({ lists }) => lists.updateList({ listId: "l1", title: "Grails 2", description: "" }),
    saved: {
      outcome: "ok",
      writes: ["update l1"],
      toasts: ["success: List updated"],
      refetchedBeforeResolve: ["l1 detail", "options", "overview"],
      refetched: ["l1 detail", "options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["update l1"],
      toasts: ["error: Failed to update list"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "delete a List",
    run: ({ lists }) => lists.deleteList("l1"),
    saved: {
      outcome: "ok",
      writes: ["delete l1"],
      toasts: ["success: List deleted"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["l1", "l1 detail", "options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["delete l1"],
      toasts: ["error: Failed to delete List"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "delete two Lists",
    run: ({ lists }) => lists.deleteLists(new Set(["l1", "l2"])),
    saved: {
      outcome: "ok",
      writes: ["delete l1,l2"],
      toasts: ["success: 2 Lists deleted"],
      refetchedBeforeResolve: ["options", "overview"],
      refetched: ["l1", "l1 detail", "options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["delete l1,l2"],
      toasts: ["error: Failed to delete Lists"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "add an Item to two Lists",
    run: ({ add }) => add.run({ targets: [...TARGETS], listIds: ["l1", "l2"] }),
    saved: {
      outcome: "ok",
      writes: ["add to l1,l2"],
      toasts: ["success: 1 Item added to 2 Lists: Open Lists"],
      refetchedBeforeResolve: ["l1", "options", "overview"],
      refetched: ["l1", "options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["add to l1,l2"],
      toasts: [],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "remove an Item from a List",
    run: ({ removeTarget }) => removeTarget.run("l1"),
    saved: {
      outcome: "ok",
      writes: ["remove target from l1"],
      toasts: [],
      refetchedBeforeResolve: ["l1", "options", "overview"],
      refetched: ["l1", "options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["remove target from l1"],
      toasts: [],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
  {
    name: "remove members from a List",
    run: ({ removeMembers }) => removeMembers.run(["m1", "m2"]),
    saved: {
      outcome: "ok",
      writes: ["remove m1,m2 from l1"],
      toasts: ["success: 2 removed from List: Undo"],
      refetchedBeforeResolve: ["l1", "options", "overview"],
      refetched: ["l1", "options", "overview"],
    },
    failed: {
      outcome: "error",
      writes: ["remove m1,m2 from l1"],
      toasts: ["error: Failed to remove from List"],
      refetchedBeforeResolve: [],
      refetched: [],
    },
  },
];

describe("list writes", () => {
  afterEach(() => act(() => toast.close()));

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

function lastToastAction() {
  const options = toastAdd.mock.calls.at(-1)?.[0];
  const onClick = options?.actionProps?.onClick;
  if (!onClick) throw new Error("the last toast has no action");
  return () => onClick(new MouseEvent("click") as never);
}

const shownToasts = () =>
  toastAdd.mock.calls.map(([options]) =>
    [options.type, options.title, options.description, options.actionProps?.children]
      .filter(Boolean)
      .join(": "),
  );

function renderListScreens() {
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <ListScreens />
      </Toaster>
    </QueryClientProvider>,
  );
  return { queryClient, view };
}

async function removeFromList(memberIds: readonly string[], title?: string) {
  const { queryClient, view } = renderListScreens();
  const settled = () => waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
  await settled();
  server.fetches.length = 0;
  toastAdd.mockClear();
  await act(async () => {
    const saved = await currentActions?.removeMembers.run(memberIds, title);
    expect(saved?.status).toBe("ok");
  });
  await settled();
  server.fetches.length = 0;
  return { settled, unmount: view.unmount };
}

async function removeEach(memberIds: readonly string[]) {
  const actions = currentActions;
  for (const memberId of memberIds) {
    await act(async () => {
      await actions?.removeMembers.run([memberId], memberId);
    });
  }
}

/** Starts a removal whose DELETE the fake server holds until the test answers it. */
async function startHeldRemove(memberIds: readonly string[]) {
  server.holdRemoves = true;
  let removing: Saving | undefined;
  await act(async () => {
    removing = currentActions?.removeMembers.run(memberIds, memberIds.join(","));
  });
  await waitFor(() => expect(server.heldRemoves.length).toBe(1));
  server.holdRemoves = false;
  return async () => {
    await act(async () => {
      server.heldRemoves.shift()?.();
      await removing;
    });
  };
}

/** Removes m1, then holds m2's removal while m1's Undo restores, and answers m2 first. */
async function answerRemovalWhileRestoring() {
  renderListScreens();
  await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
  await removeEach(["m1"]);
  const answerRemoval = await startHeldRemove(["m2"]);
  server.holdRestores = true;
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
  await waitFor(() => expect(server.heldRestores.length).toBe(1));
  await answerRemoval();
  return () => act(async () => server.heldRestores.shift()?.());
}

const shownActions = () =>
  screen
    .queryAllByRole("button")
    .filter(({ textContent }) => ["Undo", "Retry"].includes(textContent ?? "")).length;

describe("Undo after Remove from List", () => {
  afterEach(() => act(() => toast.close()));

  test("Undo sends back each removed member's target and position, then refetches the List", async () => {
    const { settled } = await removeFromList(["m1"], "Nendoroid Hatsune Miku");
    expect(shownToasts()).toEqual(["success: Nendoroid Hatsune Miku removed from List: Undo"]);
    expect(toastAdd.mock.calls.at(-1)?.[0].timeout).toBe(10_000);

    await act(async () => lastToastAction()());
    await waitFor(() => expect(server.writes).toContain("restore item-m1@0 to l1"));
    await settled();

    expect(server.writes).toEqual(["remove m1 from l1", "restore item-m1@0 to l1"]);
    expect(server.fetches.toSorted()).toEqual(["l1", "options", "overview"]);
  });

  test("one Undo puts back every member removed together", async () => {
    await removeFromList(["m1", "m2"]);
    expect(shownToasts()).toEqual(["success: 2 removed from List: Undo"]);

    await act(async () => lastToastAction()());

    await waitFor(() => expect(server.writes.at(-1)).toBe("restore item-m1@0,item-m2@1 to l1"));
  });

  test("leaving the List page closes its Undo, and the Undo it held cannot fire", async () => {
    const queryClient = new QueryClient();
    const page = (open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <Toaster>{open ? <ListScreens /> : null}</Toaster>
      </QueryClientProvider>
    );
    const view = render(page(true));
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await removeEach(["m1"]);
    const undo = lastToastAction();

    view.rerender(page(false));
    await act(async () => undo());

    await waitFor(() => expect(screen.queryAllByText(/removed from List/u).length).toBe(0));
    expect(server.writes).toEqual(["remove m1 from l1"]);
  });

  test("a failed Undo offers Retry, which sends the same restore again", async () => {
    await removeFromList(["m1"], "figma Saber");
    server.restoreFailures.push({ status: 500, value: "Failed to undo" });
    await act(async () => lastToastAction()());
    await waitFor(() => expect(shownToasts().at(-1)).toBe("error: Failed to undo: Retry"));

    await act(async () => lastToastAction()());

    await waitFor(() =>
      expect(server.writes).toEqual([
        "remove m1 from l1",
        "restore item-m1@0 to l1",
        "restore item-m1@0 to l1",
      ]),
    );
    expect(shownToasts().at(-1)).toBe("error: Failed to undo: Retry");
  });

  test("two removals whose Undos both fail each keep a Retry that puts back their own members", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    const removeThenUndo = async (run: () => Saving | undefined) => {
      await act(async () => {
        await run();
      });
      return lastToastAction();
    };
    const undos = [
      await removeThenUndo(() => currentActions?.removeMembers.run(["m1"], "m1")),
      await removeThenUndo(() => currentActions?.removeMembersFromPreorders.run(["m2"], "m2")),
    ];
    server.restoreFailures.push(
      { status: 500, value: "Failed to undo" },
      { status: 500, value: "Failed to undo" },
    );
    for (const undo of undos) await act(async () => undo());
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Retry" }).length).toBe(2));
    server.writes.length = 0;

    for (const retry of screen.getAllByRole("button", { name: "Retry" })) {
      await act(async () => fireEvent.click(retry));
    }

    await waitFor(() =>
      expect(server.writes.toSorted()).toEqual([
        "restore item-m1@0 to l1",
        "restore item-m2@0 to l2",
      ]),
    );
  });

  test("removals from one List while its Undo is open join one toast whose Undo puts all of them back", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));

    await removeEach(["m1", "m2", "m3", "m4"]);

    await waitFor(() =>
      expect(screen.queryAllByText(/removed from List/u).map((title) => title.textContent)).toEqual(
        ["4 removed from List"],
      ),
    );
    server.writes.length = 0;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await waitFor(() =>
      expect(server.writes).toEqual(["restore item-m1@0,item-m2@0,item-m3@0,item-m4@0 to l1"]),
    );
  });

  test("a joined Undo that fails keeps one Retry that puts back everything it covered", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await removeEach(["m1", "m2"]);
    server.restoreFailures.push({ status: 500, value: "Failed to undo" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Retry" }).length).toBe(1));
    server.writes.length = 0;

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));

    await waitFor(() => expect(server.writes).toEqual(["restore item-m1@0,item-m2@0 to l1"]));
  });

  test("an Undo the server refuses as invalid offers no Retry", async () => {
    await removeFromList(["m1"], "figma Saber");
    server.restoreFailures.push({ status: 422, value: "List targets must be unique" });

    await act(async () => lastToastAction()());

    await waitFor(() => expect(shownToasts().at(-1)).toBe("error: Failed to undo"));
  });

  test("an Undo that hits a defect offers no Retry", async () => {
    await removeFromList(["m1"], "figma Saber");
    server.restoreDefect = true;

    await act(async () => lastToastAction()());

    await waitFor(() => expect(shownToasts().at(-1)).toBe("error: Failed to undo"));
  });

  test("an Undo answered 401 offers no Retry", async () => {
    await removeFromList(["m1"], "figma Saber");
    server.restoreFailures.push({ status: 401, value: "Unauthorized" });

    await act(async () => lastToastAction()());

    await waitFor(() => expect(shownToasts().at(-1)).toBe("error: Failed to undo"));
  });

  test("a removal that answers while an Undo restores gets its own Undo once the restore succeeds", async () => {
    const answerRestore = await answerRemovalWhileRestoring();
    await answerRestore();
    await waitFor(() => expect(screen.queryAllByText("m2 removed from List").length).toBe(1));
    server.writes.length = 0;

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));

    await waitFor(() => expect(server.writes).toEqual(["restore item-m2@0 to l1"]));
  });

  test("a removal that answers while an Undo restores joins Retry when the restore fails with a 5xx", async () => {
    const answerRestore = await answerRemovalWhileRestoring();
    server.restoreFailures.push({ status: 500, value: "Failed to undo" });
    await answerRestore();
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Retry" }).length).toBe(1));
    server.writes.length = 0;

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));

    await waitFor(() => expect(server.writes).toEqual(["restore item-m1@0,item-m2@0 to l1"]));
    expect(screen.queryAllByRole("button", { name: "Undo" }).length).toBe(0);
  });

  test("a removal that answers while an Undo restores gets no action when the restore answers 404", async () => {
    const answerRestore = await answerRemovalWhileRestoring();
    server.restoreFailures.push({ status: 404, value: "List not found" });
    await answerRestore();

    await waitFor(() => expect(screen.queryAllByText("Failed to undo").length).toBe(1));
    expect({
      actions: shownActions(),
      reason: screen.queryAllByText("List not found").length,
    }).toEqual({
      actions: 0,
      reason: 0,
    });
  });

  test("a removal that answers after an Undo's 404 opens no Undo", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await removeEach(["m1"]);
    const answerRemoval = await startHeldRemove(["m2"]);
    server.restoreFailures.push({ status: 404, value: "List not found" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await waitFor(() => expect(screen.queryAllByText("Failed to undo").length).toBe(1));

    await answerRemoval();

    expect(shownActions()).toBe(0);
  });

  test("a removal still answering when the user leaves the List page opens nothing and posts nothing", async () => {
    const queryClient = new QueryClient();
    const page = (open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <Toaster>{open ? <ListScreens /> : null}</Toaster>
      </QueryClientProvider>
    );
    const view = render(page(true));
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    const answerRemoval = await startHeldRemove(["m1"]);
    view.rerender(page(false));

    await answerRemoval();
    for (const [options] of toastAdd.mock.calls) {
      await act(async () => options.actionProps?.onClick?.(new MouseEvent("click") as never));
    }

    expect({ toasts: shownToasts(), writes: server.writes }).toEqual({
      toasts: [],
      writes: ["remove m1 from l1"],
    });
  });

  test("an old toast's action called after a newer toast opened does nothing", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await removeEach(["m1"]);
    const firstUndo = lastToastAction();
    await act(async () => firstUndo());
    await waitFor(() => expect(currentActions?.removeMembers.isRestoring).toBe(false));
    await removeEach(["m2"]);

    await act(async () => firstUndo());

    expect(server.writes).toEqual([
      "remove m1 from l1",
      "restore item-m1@0 to l1",
      "remove m2 from l1",
    ]);
    expect(screen.queryAllByRole("button", { name: "Undo" }).length).toBe(1);
  });

  test("a removal while an Undo has failed joins Retry's payload, the newer entry winning", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await removeEach(["m1"]);
    server.restoreFailures.push({ status: 500, value: "Failed to undo" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Retry" }).length).toBe(1));

    await act(async () => {
      await currentActions?.removeMembers.run(["m2", "m1"]);
    });
    server.writes.length = 0;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));

    await waitFor(() => expect(server.writes).toEqual(["restore item-m2@0,item-m1@1 to l1"]));
    expect(screen.queryAllByRole("button", { name: "Undo" }).length).toBe(0);
  });

  test("a removal that would take a failed Undo past the route's limit starts a new Undo for itself", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    const batch = (prefix: string) =>
      Array.from({ length: 600 }, (_, index) => `${prefix}${index}`);
    await act(async () => {
      await currentActions?.removeMembers.run(batch("a"));
    });
    server.restoreFailures.push({ status: 500, value: "Failed to undo" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Retry" }).length).toBe(1));
    const retry = lastToastAction();

    await act(async () => {
      await currentActions?.removeMembers.run(batch("b"));
    });
    await act(async () => retry());

    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Retry" }).length).toBe(0));
    expect({
      undo: screen.queryAllByText(/removed from List/u).map((title) => title.textContent),
      restores: server.writes.filter((write) => write.startsWith("restore")).length,
    }).toEqual({ undo: ["600 removed from List"], restores: 1 });
  });

  test("an Undo that fails after the user left shows only its title", async () => {
    const queryClient = new QueryClient();
    const page = (open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <Toaster>{open ? <ListScreens /> : null}</Toaster>
      </QueryClientProvider>
    );
    const view = render(page(true));
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await removeEach(["m1"]);
    server.holdRestores = true;
    server.restoreFailures.push({ status: 404, value: "List not found" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    await waitFor(() => expect(server.heldRestores.length).toBe(1));

    view.rerender(page(false));
    await act(async () => server.heldRestores.shift()?.());

    await waitFor(() => expect(shownToasts().at(-1)).toBe("error: Failed to undo"));
  });

  test("removing the same target twice inside one toast's life sends it once", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await removeEach(["m1", "m1"]);
    server.writes.length = 0;

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })));

    await waitFor(() => expect(server.writes).toEqual(["restore item-m1@0 to l1"]));
  });

  test("a removal that joins the open Undo restarts its timer", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));

    await removeEach(["m1", "m2"]);

    expect(toastUpdate.mock.calls.map(([, update]) => [update.title, update.timeout])).toEqual([
      ["2 removed from List", 10_000],
    ]);
  });

  test("a removal that would take the open Undo past the route's limit starts a new one", async () => {
    renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    const batch = (prefix: string) =>
      Array.from({ length: 600 }, (_, index) => `${prefix}${index}`);

    await act(async () => {
      await currentActions?.removeMembers.run(batch("a"));
    });
    await act(async () => {
      await currentActions?.removeMembers.run(batch("b"));
    });

    await waitFor(() =>
      expect(screen.queryAllByText(/removed from List/u).map((title) => title.textContent)).toEqual(
        ["600 removed from List"],
      ),
    );
  });

  test("an Undo into a deleted List says only that it failed and offers no Retry", async () => {
    await removeFromList(["m1"], "figma Saber");
    server.restoreFailures.push({ status: 404, value: "List not found" });

    await act(async () => lastToastAction()());

    await waitFor(() => expect(shownToasts().at(-1)).toBe("error: Failed to undo"));
  });

  test("a failed remove says what happened and offers no Undo", async () => {
    const { queryClient } = renderListScreens();
    await waitFor(() => expect(server.fetches.length).toBeGreaterThanOrEqual(4));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    server.fetches.length = 0;
    server.removeFailure = { status: 404, value: "Selection not found" };
    toastAdd.mockClear();

    await act(async () => {
      const saved = await currentActions?.removeMembers.run(["m1"], "figma Saber");
      expect(saved?.status).toBe("error");
    });

    expect(shownToasts()).toEqual(["error: Failed to remove from List"]);
    await waitFor(() => expect(server.fetches).toContain("l1"));
  });
});
