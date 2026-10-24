import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { hashKey, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { Result } from "better-result";
import { toast } from "@/components/ui/toast";
import type { ApiFailure } from "./api";
import { StalePositionOrder } from "@/lib/errors/stale-position-order";
import { settle, useWrite } from "./client";

// react-query aborts a write only through a throw from onMutate, so a stale cache is thrown there
// as the move's declared failure.
const stale = () => new StalePositionOrder({ message: "The saved order changed" });

const pendingMovesByClient = new WeakMap<QueryClient, Map<string, number>>();

function pendingMovesOf(queryClient: QueryClient) {
  let pendingMoves = pendingMovesByClient.get(queryClient);
  if (!pendingMoves) {
    pendingMoves = new Map();
    pendingMovesByClient.set(queryClient, pendingMoves);
  }
  return pendingMoves;
}

export function usePositionOrderMutation({
  queryKey,
  persist,
  additionalInvalidations,
  failureTitle,
}: {
  readonly queryKey: QueryKey;
  readonly persist: (intent: PositionOrderInput) => Promise<Result<unknown, ApiFailure>>;
  readonly additionalInvalidations?: readonly {
    readonly queryKey: QueryKey;
    readonly exact?: boolean;
  }[];
  readonly failureTitle: string;
}) {
  const queryClient = useQueryClient();
  const moveKey = hashKey(queryKey);
  const mutation = useMutation({
    mutationKey: queryKey,
    mutationFn: async (intent: PositionOrderInput): Promise<void> => {
      await settle(() => persist(intent));
    },
    onMutate: async (intent) => {
      const pendingMoves = pendingMovesOf(queryClient);
      pendingMoves.set(moveKey, (pendingMoves.get(moveKey) ?? 0) + 1);
      await queryClient.cancelQueries({ queryKey, exact: true });
      const current = queryClient.getQueryData<
        InfiniteData<
          {
            readonly items: { readonly id: string }[];
            readonly totalCount: number;
            readonly limit: number;
            readonly offset: number;
          },
          number
        >
      >(queryKey);
      if (!current) throw stale();

      const items = current.pages.flatMap((page) => page.items);
      const movedIdSet = new Set(intent.movedIds);
      const movedItems = items.filter((item) => movedIdSet.has(item.id));
      if (movedItems.length !== intent.movedIds.length) throw stale();
      if (intent.anchorId !== null && movedIdSet.has(intent.anchorId)) {
        queryClient.setQueryData(queryKey, current);
        return { previous: current };
      }

      const remainingItems = items.filter((item) => !movedIdSet.has(item.id));
      let insertionIndex: number;
      if (intent.anchorId === null) {
        insertionIndex = intent.placement === "before" ? 0 : remainingItems.length;
      } else {
        const anchorIndex = remainingItems.findIndex((item) => item.id === intent.anchorId);
        if (anchorIndex === -1) throw stale();
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
      return { previous: current };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" }),
        ...(additionalInvalidations ?? []).map((invalidation) =>
          queryClient.invalidateQueries(invalidation),
        ),
      ]);
    },
    onError: (_error, _intent, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      toast.add({
        type: "error",
        title: failureTitle,
      });
    },
    onSettled: () => {
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

  const { run, isPending } = useWrite(mutation);
  return { move: run, isPending } as const;
}
