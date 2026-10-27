import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { hashKey } from "@tanstack/react-query";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ApiFailure } from "./api";
import type { WritableFamily } from "./catalog";
import { StalePositionOrder } from "@/lib/errors/stale-position-order";
import { defineCommand, useResourceMutation } from "./client";
import type { Command, RefetchKey } from "./client";

const stale = () => Result.err(new StalePositionOrder({ message: "The saved order changed" }));

const pendingMovesByClient = new WeakMap<QueryClient, Map<string, number>>();

function pendingMovesOf(queryClient: QueryClient) {
  let pendingMoves = pendingMovesByClient.get(queryClient);
  if (!pendingMoves) {
    pendingMoves = new Map();
    pendingMovesByClient.set(queryClient, pendingMoves);
  }
  return pendingMoves;
}

type OrderedPages = InfiniteData<
  {
    readonly items: { readonly id: string }[];
    readonly totalCount: number;
    readonly limit: number;
    readonly offset: number;
  },
  number
>;

type PositionOrderMove = Command<PositionOrderInput, unknown, ApiFailure | StalePositionOrder>;

/**
 * A move of items within one ordered list. It patches the list's cache at once, and the list
 * refetches once no move of it is still saving.
 */
export function positionOrderCommand<const F extends WritableFamily>({
  family,
  queryKey,
  persist,
  additionalInvalidations = [],
  failureTitle,
}: {
  readonly family: F;
  readonly queryKey: RefetchKey<F>["queryKey"];
  readonly persist: (intent: PositionOrderInput) => Promise<Result<unknown, ApiFailure>>;
  readonly additionalInvalidations?: readonly RefetchKey<F>[];
  readonly failureTitle: string;
}): PositionOrderMove {
  const moveKey = hashKey(queryKey);
  return defineCommand<PositionOrderInput, unknown, ApiFailure | StalePositionOrder, F>({
    invalidates: [family],
    refetchKeys: () => [{ queryKey, exact: true, refetchType: "none" }, ...additionalInvalidations],
    persist,
    optimistic: async (queryClient, intent) => {
      const pendingMoves = pendingMovesOf(queryClient);
      pendingMoves.set(moveKey, (pendingMoves.get(moveKey) ?? 0) + 1);
      await queryClient.cancelQueries({ queryKey, exact: true });
      const current = queryClient.getQueryData<OrderedPages>(queryKey);
      if (!current) return stale();
      const restore = () => {
        queryClient.setQueryData(queryKey, current);
      };

      const items = current.pages.flatMap((page) => page.items);
      const movedIdSet = new Set(intent.movedIds);
      const movedItems = items.filter((item) => movedIdSet.has(item.id));
      if (movedItems.length !== intent.movedIds.length) return stale();
      if (intent.anchorId !== null && movedIdSet.has(intent.anchorId)) {
        restore();
        return Result.ok(restore);
      }

      const remainingItems = items.filter((item) => !movedIdSet.has(item.id));
      let insertionIndex: number;
      if (intent.anchorId === null) {
        insertionIndex = intent.placement === "before" ? 0 : remainingItems.length;
      } else {
        const anchorIndex = remainingItems.findIndex((item) => item.id === intent.anchorId);
        if (anchorIndex === -1) return stale();
        insertionIndex = anchorIndex + (intent.placement === "after" ? 1 : 0);
      }

      const reorderedItems = [
        ...remainingItems.slice(0, insertionIndex),
        ...movedItems,
        ...remainingItems.slice(insertionIndex),
      ];
      queryClient.setQueryData(queryKey, {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: reorderedItems.slice(page.offset, page.offset + page.items.length),
        })),
      });
      return Result.ok(restore);
    },
    failureToast: () => ({ title: failureTitle }),
    settled: (queryClient) => {
      const pendingMoves = pendingMovesOf(queryClient);
      const remaining = (pendingMoves.get(moveKey) ?? 1) - 1;
      if (remaining > 0) {
        pendingMoves.set(moveKey, remaining);
        return;
      }
      pendingMoves.delete(moveKey);
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
}

export function usePositionOrderMutation(command: PositionOrderMove) {
  const { run, isPending } = useResourceMutation(command);
  return { move: run, isPending } as const;
}
