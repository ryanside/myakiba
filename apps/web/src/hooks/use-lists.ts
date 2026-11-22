import type { ListInput, ListMemberRestore, ListTarget } from "@myakiba/contracts/lists/schema";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";
import { useEffect, useRef, useState } from "react";
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

type Members = readonly ListMemberRestore[];

/** Removed members not yet offered an Undo, and the title to name one of them by. */
type Removal = { readonly members: Members; readonly soleTitle: string | undefined };

type UndoState =
  | { readonly kind: "none" }
  | { readonly kind: "open"; readonly toastId: string; readonly members: Members }
  | { readonly kind: "restoring"; readonly members: Members; readonly later: Removal | null }
  | { readonly kind: "failed"; readonly toastId: string; readonly members: Members }
  | { readonly kind: "ended" };

const NONE: UndoState = { kind: "none" };
const ENDED: UndoState = { kind: "ended" };

const targetKey = ({ type, id }: ListTarget) => `${type}:${id}`;

function joinByTarget(older: Members, newer: Members): Members {
  const newerKeys = new Set(newer.map(targetKey));
  return [...older.filter((member) => !newerKeys.has(targetKey(member))), ...newer];
}

const titleOf = ({ members, soleTitle }: Removal) =>
  `${members.length === 1 && soleTitle ? soleTitle : members.length} removed from List`;

/** The List page's Undo, whose states and events are tabled in the PR. */
export function useRemoveListMembersMutation(listId: string) {
  const [state, setState] = useState<UndoState>(NONE);
  const current = useRef<UndoState>(NONE);
  const go = (next: UndoState) => {
    if (current.current.kind === "ended") return;
    current.current = next;
    setState(next);
  };
  useEffect(
    () => () => {
      const left = current.current;
      current.current = ENDED;
      if (left.kind === "open" || left.kind === "failed") toast.close(left.toastId);
    },
    [],
  );

  const holding = (toastId: string) => {
    const now = current.current;
    return (now.kind === "open" || now.kind === "failed") && now.toastId === toastId ? now : null;
  };
  const closed = (toastId: string) => {
    if (holding(toastId)) go(NONE);
  };
  const restoreNow = (toastId: string) => {
    const now = holding(toastId);
    if (!now) return;
    go({ kind: "restoring", members: now.members, later: null });
    toast.close(toastId);
    return restore.run({ listId, members: now.members });
  };
  const openUndo = (removal: Removal) => {
    const toastId: string = toast.add({
      type: "success",
      title: titleOf(removal),
      timeout: UNDO_TIMEOUT_MS,
      actionProps: { children: "Undo", onClick: () => restoreNow(toastId) },
      onClose: () => closed(toastId),
    });
    go({ kind: "open", toastId, members: removal.members });
  };
  const removedOk = (added: Removal) => {
    const now = current.current;
    if (now.kind === "ended") return;
    if (now.kind === "none") {
      openUndo(added);
      return;
    }
    const held = now.kind === "restoring" ? (now.later?.members ?? []) : now.members;
    const joined = { members: joinByTarget(held, added.members), soleTitle: added.soleTitle };
    const fits = joined.members.length <= WRITE_LIMITS.ids;
    if (now.kind === "restoring") {
      go({ ...now, later: fits ? joined : added });
    } else if (fits) {
      if (now.kind === "open") {
        toast.update(now.toastId, { title: titleOf(joined), timeout: UNDO_TIMEOUT_MS });
      }
      go({ ...now, members: joined.members });
    } else {
      go(NONE);
      toast.close(now.toastId);
      openUndo(added);
    }
  };
  /** Leaves `restoring`, then answers the removals that arrived meanwhile from where it landed. */
  const settle = (next: UndoState, later: Removal | null) => {
    go(next);
    if (later) removedOk(later);
  };
  const restore = useResourceMutation(restoreListMembersCommand, {
    onSaved: () => {
      const now = current.current;
      if (now.kind === "restoring") settle(NONE, now.later);
    },
    onFailed: (_input, failureToast, failure) => {
      const now = current.current;
      if (now.kind !== "restoring") {
        toast.add({ type: "error", title: failureToast.title });
        return;
      }
      if (failure instanceof ApiUnreachable || failure instanceof ApiServerError) {
        const toastId = `undo-failed:${crypto.randomUUID()}`;
        toast.add({
          type: "error",
          id: toastId,
          title: failureToast.title,
          actionProps: { children: "Retry", onClick: () => restoreNow(toastId) },
          onClose: () => closed(toastId),
        });
        settle({ kind: "failed", toastId, members: now.members }, now.later);
        return;
      }
      toast.add({ type: "error", title: failureToast.title });
      settle(failure instanceof ApiNotFound ? ENDED : NONE, now.later);
    },
  });
  const remove = useResourceMutation(removeListMembersCommand);

  return {
    run: async (memberIds: readonly string[], soleMemberTitle?: string) => {
      const removed = await remove.run({ listId, memberIds });
      if (removed.isErr()) {
        if (removed.error.cause instanceof ApiNotFound) await remove.refetch();
        return removed;
      }
      removedOk({ members: removed.value.removed, soleTitle: soleMemberTitle });
      return removed;
    },
    isPending: remove.isPending,
    isRestoring: state.kind === "restoring",
    variables: remove.pendingInput?.memberIds,
  } as const;
}

export function useMoveListMembersMutation(listId: string) {
  return usePositionOrderMutation(listMembersMove(listId));
}
