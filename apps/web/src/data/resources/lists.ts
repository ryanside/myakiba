import { LIST_PAGE_SIZE } from "@myakiba/contracts/lists/schema";
import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import {
  addTargetsToLists,
  createList,
  deleteLists,
  getList,
  getListMembers,
  getListOptionsForTargets,
  getLists,
  moveListMembers,
  moveLists,
  removeListMembers,
  removeTargetsFromList,
  updateList,
} from "@/queries/lists";
import { defineCommand, offsetAfterLoaded, rootedInfiniteRead, rootedRead } from "../client";

const overviewKey = ["lists", "overview"] as const;
const detailKey = (listId: string) => ["lists", "detail", listId] as const;
const membersKey = (listId: string) => [...detailKey(listId), "members"] as const;
const anyTargetOptions = { queryKey: ["lists", "target-options"] } as const;
const overview = { queryKey: overviewKey, exact: true } as const;

export const lists = {
  overview: rootedInfiniteRead("lists", {
    key: () => overviewKey,
    loadPage: (_input: undefined, offset) => getLists(LIST_PAGE_SIZE, offset),
    nextOffset: offsetAfterLoaded,
    staleTime: 30_000,
  }),
  detail: rootedRead("lists", {
    key: detailKey,
    load: getList,
  }),
  members: rootedInfiniteRead("lists", {
    key: membersKey,
    loadPage: (listId: string, offset) => getListMembers(listId, LIST_PAGE_SIZE, offset),
    nextOffset: offsetAfterLoaded,
  }),
  targetOptions: rootedRead("lists", {
    key: (targets: readonly ListTarget[]) => ["lists", "target-options", targets] as const,
    load: getListOptionsForTargets,
    staleTime: 30_000,
  }),
};

export const listsMove = {
  queryKey: overviewKey,
  persist: moveLists,
  additionalInvalidations: [anyTargetOptions],
  failureTitle: "Failed to save List order",
} as const;

export const listMembersMove = (listId: string) =>
  ({
    queryKey: membersKey(listId),
    persist: (intent: Parameters<typeof moveListMembers>[1]) => moveListMembers(listId, intent),
    additionalInvalidations: [overview],
    failureTitle: "Failed to save List order",
  }) as const;

const createListSpec = {
  invalidates: ["lists"],
  refetchKeys: () => [overview, anyTargetOptions],
  persist: createList,
} as const;

export const createListCommand = defineCommand({
  ...createListSpec,
  failureTitle: () => "Failed to create list",
});

/** For a form that shows its own error. */
export const createListQuietlyCommand = defineCommand(createListSpec);

export const updateListCommand = defineCommand({
  invalidates: ["lists"],
  refetchKeys: ({ listId }) => [
    overview,
    { queryKey: detailKey(listId), exact: true },
    anyTargetOptions,
  ],
  persist: ({ listId, ...input }: { readonly listId: string } & ListInput) =>
    updateList(listId, input),
  successTitle: () => "List updated",
  failureTitle: () => "Failed to update list",
});

export const deleteListsCommand = defineCommand({
  invalidates: ["lists"],
  refetchKeys: () => [overview, anyTargetOptions],
  persist: (listIds: readonly string[]) => deleteLists(listIds),
  saved: async (queryClient, listIds) => {
    for (const listId of listIds) {
      queryClient.removeQueries({ queryKey: detailKey(listId) });
    }
  },
  successTitle: (listIds) =>
    listIds.length === 1 ? "List deleted" : `${listIds.length.toLocaleString()} Lists deleted`,
  failureTitle: (listIds) => `Failed to delete ${listIds.length === 1 ? "List" : "Lists"}`,
});

export const addTargetsToListsCommand = defineCommand({
  invalidates: ["lists"],
  refetchKeys: ({ listIds }) => [
    overview,
    anyTargetOptions,
    ...listIds.map((listId) => ({ queryKey: membersKey(listId), exact: true }) as const),
  ],
  persist: ({
    targets,
    listIds,
  }: {
    readonly targets: readonly ListTarget[];
    readonly listIds: readonly string[];
  }) => addTargetsToLists(targets, listIds),
});

export const removeTargetsFromListCommand = defineCommand({
  invalidates: ["lists"],
  refetchKeys: ({ listId }) => [
    overview,
    { queryKey: membersKey(listId), exact: true },
    anyTargetOptions,
  ],
  persist: ({
    targets,
    listId,
  }: {
    readonly targets: readonly ListTarget[];
    readonly listId: string;
  }) => removeTargetsFromList(targets, listId),
});

export const removeListMembersCommand = defineCommand({
  invalidates: ["lists"],
  refetchKeys: ({ listId }) => [
    overview,
    { queryKey: membersKey(listId), exact: true },
    anyTargetOptions,
  ],
  persist: ({
    listId,
    memberIds,
  }: {
    readonly listId: string;
    readonly memberIds: readonly string[];
  }) => removeListMembers(listId, memberIds),
  successTitle: ({ memberIds }) => `${memberIds.length} removed from List`,
  failureTitle: () => "Failed to remove from List",
});
