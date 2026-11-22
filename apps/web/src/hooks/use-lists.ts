import type { ListInput, ListMemberRestore, ListTarget } from "@myakiba/contracts/lists/schema";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";
import { useEffect, useRef } from "react";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { ApiUnreachable } from "@/lib/errors/api-unreachable";
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

const UNDO_TIMEOUT_MS = 10_000;

type PendingRestore = { readonly toastId: string; readonly members: readonly ListMemberRestore[] };
type Pending = { undo?: PendingRestore; retry?: PendingRestore; left: boolean };

const targetKey = ({ type, id }: ListTarget) => `${type}:${id}`;

function joinByTarget(
  older: readonly ListMemberRestore[],
  newer: readonly ListMemberRestore[],
): readonly ListMemberRestore[] {
  const newerKeys = new Set(newer.map(targetKey));
  return [...older.filter((member) => !newerKeys.has(targetKey(member))), ...newer];
}

export function useRemoveListMembersMutation(listId: string) {
  const pending = useRef<Pending>({ left: false });
  useEffect(() => {
    const current = pending.current;
    current.left = false;
    return () => {
      current.left = true;
      for (const held of [current.undo, current.retry]) if (held) toast.close(held.toastId);
      current.undo = undefined;
      current.retry = undefined;
    };
  }, []);

  const forget = (slot: "undo" | "retry", toastId: string) => () => {
    if (pending.current[slot]?.toastId === toastId) pending.current[slot] = undefined;
  };
  const take = (slot: "undo" | "retry") => {
    const held = pending.current[slot];
    if (!held) return [];
    pending.current[slot] = undefined;
    toast.close(held.toastId);
    return held.members;
  };
  const restore = useResourceMutation(restoreListMembersCommand, {
    onFailed: (input, failureToast, failure) => {
      if (failure instanceof ApiNotFound) {
        take("undo");
        take("retry");
      }
      const retryable = failure instanceof ApiUnreachable || failure instanceof ApiServerError;
      if (!retryable || pending.current.left) {
        toast.add({ type: "error", ...failureToast });
        return;
      }
      const members = joinByTarget(pending.current.retry?.members ?? [], input.members);
      const toastId = `undo-failed:${input.listId}`;
      toast.add({
        type: "error",
        id: toastId,
        title: failureToast.title,
        actionProps: { children: "Retry", onClick: () => restoreTaken("retry") },
        onClose: forget("retry", toastId),
      });
      pending.current.retry = { toastId, members };
    },
  });
  const restoreTaken = (slot: "undo" | "retry") => {
    const members = take(slot);
    return members.length > 0 ? restore.run({ listId, members }) : undefined;
  };
  const remove = useResourceMutation(removeListMembersCommand);

  return {
    run: async (memberIds: readonly string[], soleMemberTitle?: string) => {
      const removed = await remove.run({ listId, memberIds });
      if (removed.isErr()) {
        if (removed.error.cause instanceof ApiNotFound) await remove.refetch();
        return removed;
      }
      if (pending.current.left) return removed;
      const open = pending.current.undo;
      const joined = joinByTarget(open?.members ?? [], removed.value.removed);
      const members = joined.length > WRITE_LIMITS.ids ? removed.value.removed : joined;
      const title = `${members.length === 1 && soleMemberTitle ? soleMemberTitle : members.length} removed from List`;
      if (open && members === joined) {
        toast.update(open.toastId, { title, timeout: UNDO_TIMEOUT_MS });
        pending.current.undo = { toastId: open.toastId, members };
        return removed;
      }
      if (open) take("undo");
      const toastId: string = toast.add({
        type: "success",
        title,
        timeout: UNDO_TIMEOUT_MS,
        actionProps: { children: "Undo", onClick: () => restoreTaken("undo") },
        onClose: () => forget("undo", toastId)(),
      });
      pending.current.undo = { toastId, members };
      return removed;
    },
    isPending: remove.isPending,
    variables: remove.pendingInput?.memberIds,
  } as const;
}

export function useMoveListMembersMutation(listId: string) {
  return usePositionOrderMutation(listMembersMove(listId));
}
