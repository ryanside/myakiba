import { LIST_PAGE_SIZE } from "@myakiba/contracts/lists/schema";
import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
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
import { usePositionOrderMutation } from "@/hooks/use-position-order-mutation";

export function useListsQuery() {
  return useInfiniteQuery({
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

export function useListQuery(listId: string) {
  return useQuery({
    queryKey: ["lists", "detail", listId] as const,
    queryFn: () => getList(listId),
  });
}

export function useListMembersQuery(listId: string) {
  return useInfiniteQuery({
    queryKey: ["lists", "detail", listId, "members"] as const,
    queryFn: ({ pageParam }) => getListMembers(listId, LIST_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((count, page) => count + page.items.length, 0);
      return loadedCount < lastPage.totalCount ? loadedCount : undefined;
    },
  });
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

export function useMoveListsMutation() {
  return usePositionOrderMutation({
    queryKey: ["lists", "overview"],
    persist: moveLists,
    additionalInvalidations: [{ queryKey: ["lists", "target-options"] }],
    failureTitle: "Failed to save List order",
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
  return usePositionOrderMutation({
    queryKey: ["lists", "detail", listId, "members"],
    persist: (intent) => moveListMembers(listId, intent),
    additionalInvalidations: [{ queryKey: ["lists", "overview"], exact: true }],
    failureTitle: "Failed to save List order",
  });
}
