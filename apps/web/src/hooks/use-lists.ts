import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { useRead, useResourceMutation, useRootedInfiniteRead } from "@/data/client";
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
  restoreListMembersCommand,
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
    createList: (input: ListInput) => createMutation.run(input),
    updateList: (input: { readonly listId: string } & ListInput) => updateMutation.run(input),
    deleteList: (listId: string) => deleteMutation.run([listId]),
    deleteLists: (listIds: ReadonlySet<string>) => deleteMutation.run([...listIds]),
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
    run: (input: { readonly targets: ListTarget[]; readonly listIds: string[] }) =>
      mutation.run(input),
    isPending: mutation.isPending,
    last: mutation.last,
    reset: mutation.reset,
  } as const;
}

export function useRemoveTargetsFromListMutation(targets: readonly ListTarget[]) {
  const mutation = useResourceMutation(removeTargetsFromListCommand);
  return {
    run: (listId: string) => mutation.run({ targets, listId }),
    isPending: mutation.isPending,
    last: mutation.last,
  } as const;
}

/** Long enough to hear the toast and reach Undo with F6; it pauses while hovered or focused. */
const UNDO_TIMEOUT_MS = 10_000;

/** Removes at once; the toast's Undo puts the removed members back where they were. */
export function useRemoveListMembersMutation(listId: string) {
  const restore = useResourceMutation(restoreListMembersCommand, {
    onFailed: (input, failureToast, failure) => {
      const toastId = toast.add({
        type: "error",
        ...failureToast,
        ...(!(failure instanceof ApiNotFound) && {
          actionProps: {
            children: "Retry",
            onClick() {
              toast.close(toastId);
              void restore.run(input);
            },
          },
        }),
      });
    },
  });
  const remove = useResourceMutation(removeListMembersCommand);

  return {
    /** `title` names the member when only one is removed. */
    run: async (memberIds: readonly string[], title?: string) => {
      const removed = await remove.run({ listId, memberIds });
      if (removed.isErr()) return removed;
      const toastId = toast.add({
        type: "success",
        title: `${memberIds.length === 1 && title ? title : memberIds.length} removed from List`,
        timeout: UNDO_TIMEOUT_MS,
        actionProps: {
          children: "Undo",
          onClick() {
            toast.close(toastId);
            void restore.run({ listId, members: removed.value.removed });
          },
        },
      });
      return removed;
    },
    isPending: remove.isPending,
    variables: remove.pendingInput?.memberIds,
  } as const;
}

export function useMoveListMembersMutation(listId: string) {
  return usePositionOrderMutation(listMembersMove(listId));
}
