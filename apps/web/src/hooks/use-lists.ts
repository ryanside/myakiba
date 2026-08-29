import { LIST_PAGE_SIZE } from "@myakiba/contracts/lists/schema";
import type { ListInput, ListOrderInput, ListTarget } from "@myakiba/contracts/lists/schema";
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import {
  ListOrderChangedError,
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

type ListsPage = NonNullable<Awaited<ReturnType<typeof getLists>>>;
type ListRecord = ListsPage["items"][number];
type ListMembersPage = NonNullable<Awaited<ReturnType<typeof getListMembers>>>;
type ListMember = ListMembersPage["items"][number];

interface OffsetPage<T> {
  readonly items: T[];
  readonly totalCount: number;
  readonly limit: number;
  readonly offset: number;
}

type OffsetInfiniteData<T> = InfiniteData<OffsetPage<T>, number>;

function repartitionInfiniteItems<T>(
  data: OffsetInfiniteData<T>,
  items: readonly T[],
  totalCount: number,
): OffsetInfiniteData<T> {
  const firstPage = data.pages[0];
  if (!firstPage) return data;

  const pageCount = Math.max(1, Math.ceil(items.length / firstPage.limit));
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const template = data.pages[index] ?? data.pages.at(-1) ?? firstPage;
    const offset = index * firstPage.limit;
    return {
      ...template,
      items: items.slice(offset, offset + firstPage.limit),
      totalCount,
      limit: firstPage.limit,
      offset,
    };
  });

  return { pages, pageParams: pages.map((page) => page.offset) };
}

function moveInfiniteItems<T extends { readonly id: string }>(
  data: OffsetInfiniteData<T>,
  intent: ListOrderInput,
): OffsetInfiniteData<T> | null {
  const items = data.pages.flatMap((page) => page.items);
  const movedIdSet = new Set(intent.movedIds);
  const movedItems = items.filter((item) => movedIdSet.has(item.id));
  if (movedItems.length !== intent.movedIds.length) return null;
  if (intent.anchorId !== null && movedIdSet.has(intent.anchorId)) return data;

  const remainingItems = items.filter((item) => !movedIdSet.has(item.id));
  let insertionIndex: number;
  if (intent.anchorId === null) {
    insertionIndex = intent.placement === "before" ? 0 : remainingItems.length;
  } else {
    const anchorIndex = remainingItems.findIndex((item) => item.id === intent.anchorId);
    if (anchorIndex === -1) return null;
    insertionIndex = anchorIndex + (intent.placement === "after" ? 1 : 0);
  }

  const reorderedItems = [
    ...remainingItems.slice(0, insertionIndex),
    ...movedItems,
    ...remainingItems.slice(insertionIndex),
  ];
  return repartitionInfiniteItems(data, reorderedItems, data.pages[0]?.totalCount ?? items.length);
}

function applyMovedPositions<T extends { readonly id: string; readonly position: number }>(
  data: OffsetInfiniteData<T>,
  moved: readonly { readonly id: string; readonly position: number }[],
): OffsetInfiniteData<T> {
  const positionById = new Map(moved.map((item) => [item.id, item.position]));
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => {
        const position = positionById.get(item.id);
        return position === undefined ? item : { ...item, position };
      }),
    })),
  };
}

function listsInfiniteQueryOptions() {
  return infiniteQueryOptions({
    queryKey: ["lists", "overview"] as const,
    queryFn: ({ pageParam }) => getLists(LIST_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((count, page) => count + page.items.length, 0);
      return loadedCount < lastPage.totalCount ? loadedCount : undefined;
    },
    staleTime: 30_000,
  });
}

function listQueryOptions(listId: string) {
  return queryOptions({
    queryKey: ["lists", "detail", listId] as const,
    queryFn: () => getList(listId),
  });
}

function listMembersInfiniteQueryOptions(listId: string) {
  return infiniteQueryOptions({
    queryKey: ["lists", "detail", listId, "members"] as const,
    queryFn: ({ pageParam }) => getListMembers(listId, LIST_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((count, page) => count + page.items.length, 0);
      return loadedCount < lastPage.totalCount ? loadedCount : undefined;
    },
  });
}

export function useListsQuery() {
  return useInfiniteQuery(listsInfiniteQueryOptions());
}

export function useListQuery(listId: string) {
  return useQuery(listQueryOptions(listId));
}

export function useListMembersQuery(listId: string) {
  return useInfiniteQuery(listMembersInfiniteQueryOptions(listId));
}

export function useListOptionsForTargetsQuery(targets: readonly ListTarget[], enabled: boolean) {
  return useQuery({
    queryKey: ["lists", "target-options", targets] as const,
    queryFn: () => getListOptionsForTargets(targets),
    enabled: enabled && targets.length > 0,
    staleTime: 30_000,
  });
}

export function useListMutations({
  showCreateErrorToast = true,
}: { readonly showCreateErrorToast?: boolean } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation({
    mutationFn: createList,
    onSuccess: async (created) => {
      const toastId = toast.add({
        type: "success",
        title: "List created",
        actionProps: {
          children: "Open List",
          onClick() {
            toast.close(toastId);
            void navigate({ to: "/lists/$listId", params: { listId: created.id } });
          },
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lists", "overview"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["lists", "target-options"] }),
      ]);
    },
    onError: () => {
      if (showCreateErrorToast) {
        toast.add({ type: "error", title: "Failed to create list" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ listId, ...input }: { readonly listId: string } & ListInput) =>
      updateList(listId, input),
    onSuccess: async (_updated, { listId }) => {
      toast.add({ type: "success", title: "List updated" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lists", "overview"], exact: true }),
        queryClient.invalidateQueries({
          queryKey: ["lists", "detail", listId],
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: ["lists", "target-options"] }),
      ]);
    },
    onError: () => toast.add({ type: "error", title: "Failed to update list" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLists,
    onSuccess: async (_data, listIds) => {
      for (const listId of listIds) {
        queryClient.removeQueries({ queryKey: ["lists", "detail", listId] });
      }
      toast.add({
        type: "success",
        title:
          listIds.length === 1
            ? "List deleted"
            : `${listIds.length.toLocaleString()} Lists deleted`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lists", "overview"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["lists", "target-options"] }),
      ]);
    },
    onError: (_error, listIds) =>
      toast.add({
        type: "error",
        title: `Failed to delete ${listIds.length === 1 ? "List" : "Lists"}`,
      }),
  });

  return {
    createList: createMutation.mutateAsync,
    updateList: updateMutation.mutateAsync,
    deleteList: (listId: string) => deleteMutation.mutateAsync([listId]),
    deleteLists: (listIds: ReadonlySet<string>) => deleteMutation.mutateAsync([...listIds]),
    isCreating: createMutation.isPending,
    updatingListId: updateMutation.variables?.listId,
    isDeleting: deleteMutation.isPending,
  } as const;
}

function useMoveMutation<T extends { readonly id: string; readonly position: number }>({
  queryKey,
  persist,
  additionalInvalidation,
}: {
  readonly queryKey: QueryKey;
  readonly persist: (
    intent: ListOrderInput,
  ) => Promise<{ readonly moved: readonly { readonly id: string; readonly position: number }[] }>;
  readonly additionalInvalidation: {
    readonly queryKey: QueryKey;
    readonly exact?: boolean;
  };
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: persist,
    onMutate: async (intent) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const current = queryClient.getQueryData<OffsetInfiniteData<T>>(queryKey);
      const optimistic = current ? moveInfiniteItems(current, intent) : null;
      if (!optimistic) {
        throw new ListOrderChangedError("The List changed");
      }

      queryClient.setQueryData(queryKey, optimistic);
      return { previous: current };
    },
    onSuccess: async (result) => {
      queryClient.setQueryData<OffsetInfiniteData<T>>(queryKey, (latest) =>
        latest ? applyMovedPositions(latest, result.moved) : latest,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" }),
        queryClient.invalidateQueries(additionalInvalidation),
      ]);
    },
    onError: async (error, _intent, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      await queryClient.refetchQueries({ queryKey, exact: true });
      toast.add({
        type: "error",
        title:
          error instanceof ListOrderChangedError
            ? "The List changed. Try again."
            : "Failed to save List order",
      });
    },
  });

  return { move: mutation.mutateAsync, isPending: mutation.isPending } as const;
}

export function useMoveListsMutation() {
  return useMoveMutation<ListRecord>({
    queryKey: ["lists", "overview"],
    persist: moveLists,
    additionalInvalidation: { queryKey: ["lists", "target-options"] },
  });
}

export function useAddTargetsToListsMutation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({
      targets,
      listIds,
    }: {
      readonly targets: ListTarget[];
      readonly listIds: string[];
    }) => addTargetsToLists(targets, listIds),
    onSuccess: async (data, { targets, listIds }) => {
      const targetCount = targets.length;
      const listCount = listIds.length;
      let singularNoun: "Item" | "Collection Item" | "Order" | null = null;
      if (targets.every((target) => target.type === "item")) {
        singularNoun = "Item";
      } else if (targets.every((target) => target.type === "collectionItem")) {
        singularNoun = "Collection Item";
      } else if (targets.every((target) => target.type === "order")) {
        singularNoun = "Order";
      }
      const targetLabel = singularNoun
        ? `${targetCount} ${targetCount === 1 ? singularNoun : `${singularNoun}s`}`
        : `${targetCount} selected`;
      const listLabel = `${listCount} ${listCount === 1 ? "List" : "Lists"}`;
      const possibleAdditionCount = targetCount * listCount;
      const alreadyAddedCount = possibleAdditionCount - data.addedCount;
      let title = `${targetLabel} added to ${listLabel}`;
      if (data.addedCount === 0) {
        title = `${targetLabel} ${targetCount === 1 ? "is" : "are"} already in ${listCount === 1 ? "that List" : "those Lists"}`;
      } else if (alreadyAddedCount > 0) {
        title = `${targetLabel} ${targetCount === 1 ? "is" : "are"} now in ${listLabel}`;
      }
      const toastId = toast.add({
        type: "success",
        title,
        description:
          alreadyAddedCount > 0 && data.addedCount > 0
            ? `${data.addedCount} added; ${alreadyAddedCount} ${alreadyAddedCount === 1 ? "was" : "were"} already there.`
            : undefined,
        actionProps: {
          children: listIds.length === 1 ? "Open List" : "Open Lists",
          onClick() {
            toast.close(toastId);
            if (listIds.length === 1) {
              void navigate({ to: "/lists/$listId", params: { listId: listIds[0] } });
              return;
            }

            void navigate({ to: "/lists" });
          },
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lists", "overview"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["lists", "target-options"] }),
        ...listIds.map((listId) =>
          queryClient.invalidateQueries({
            queryKey: ["lists", "detail", listId, "members"],
            exact: true,
          }),
        ),
      ]);
    },
  });
}

export function useRemoveTargetsFromListMutation(targets: readonly ListTarget[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => removeTargetsFromList(targets, listId),
    onSuccess: async (_data, listId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lists", "overview"], exact: true }),
        queryClient.invalidateQueries({
          queryKey: ["lists", "detail", listId, "members"],
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: ["lists", "target-options"] }),
      ]);
    },
  });
}

export function useRemoveListMembersMutation(listId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberIds: readonly string[]) => removeListMembers(listId, memberIds),
    onSuccess: async (_data, memberIds) => {
      toast.add({
        type: "success",
        title: `${memberIds.length} removed from List`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lists", "overview"], exact: true }),
        queryClient.invalidateQueries({
          queryKey: ["lists", "detail", listId, "members"],
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: ["lists", "target-options"] }),
      ]);
    },
    onError: () => toast.add({ type: "error", title: "Failed to remove from List" }),
  });
}

export function useMoveListMembersMutation(listId: string) {
  return useMoveMutation<ListMember>({
    queryKey: ["lists", "detail", listId, "members"],
    persist: (intent) => moveListMembers(listId, intent),
    additionalInvalidation: { queryKey: ["lists", "overview"], exact: true },
  });
}
