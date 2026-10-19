import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { orThrow, useRead, useResourceMutation, useRootedInfiniteRead } from "@/data/client";
import { usePositionOrderMutation } from "@/data/position-order";
import {
  addTargetsToListsCommand,
  createListCommand,
  createListQuietlyCommand,
  deleteListsCommand,
  listMembersMove,
  lists,
  listsMove,
  removeListMembersCommand,
  removeTargetsFromListCommand,
  updateListCommand,
} from "@/data/resources/lists";

export function useListsQuery() {
  return useRootedInfiniteRead(lists.overview);
}

export function useListQuery(listId: string) {
  return useRead(lists.detail, listId);
}

export function useListMembersQuery(listId: string) {
  return useRootedInfiniteRead(lists.members, listId);
}

export function useListOptionsForTargetsQuery(targets: readonly ListTarget[], enabled: boolean) {
  return useRead(lists.targetOptions, targets, { enabled: enabled && targets.length > 0 });
}

export function useListMutations({
  showCreateErrorToast = true,
}: { readonly showCreateErrorToast?: boolean } = {}) {
  const navigate = useNavigate();

  const createMutation = useResourceMutation(
    showCreateErrorToast ? createListCommand : createListQuietlyCommand,
    {
      onSaved: (_input, created) => {
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
      },
    },
  );
  const updateMutation = useResourceMutation(updateListCommand);
  const deleteMutation = useResourceMutation(deleteListsCommand);

  return {
    createList: (input: ListInput) => orThrow(createMutation.run(input)),
    updateList: (input: { readonly listId: string } & ListInput) =>
      orThrow(updateMutation.run(input)),
    deleteList: (listId: string) => orThrow(deleteMutation.run([listId])),
    deleteLists: (listIds: ReadonlySet<string>) => orThrow(deleteMutation.run([...listIds])),
    isDeleting: deleteMutation.isPending,
  } as const;
}

export function useMoveListsMutation() {
  return usePositionOrderMutation(listsMove);
}

export function useAddTargetsToListsMutation() {
  const navigate = useNavigate();
  const mutation = useResourceMutation(addTargetsToListsCommand, {
    onSaved: ({ targets, listIds }, data) => {
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
            if (listIds.length === 1 && listIds[0] !== undefined) {
              void navigate({ to: "/lists/$listId", params: { listId: listIds[0] } });
              return;
            }

            void navigate({ to: "/lists" });
          },
        },
      });
    },
  });
  return {
    mutateAsync: (input: { readonly targets: ListTarget[]; readonly listIds: string[] }) =>
      orThrow(mutation.run(input)),
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  } as const;
}

export function useRemoveTargetsFromListMutation(targets: readonly ListTarget[]) {
  const mutation = useResourceMutation(removeTargetsFromListCommand);
  return {
    mutateAsync: (listId: string) => orThrow(mutation.run({ targets, listId })),
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
  } as const;
}

export function useRemoveListMembersMutation(listId: string) {
  const mutation = useResourceMutation(removeListMembersCommand);
  return {
    mutateAsync: (memberIds: readonly string[]) => orThrow(mutation.run({ listId, memberIds })),
    isPending: mutation.isPending,
    variables: mutation.pendingInput?.memberIds,
  } as const;
}

export function useMoveListMembersMutation(listId: string) {
  return usePositionOrderMutation(listMembersMove(listId));
}
