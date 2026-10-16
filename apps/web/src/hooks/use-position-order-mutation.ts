import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { hashKey, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";

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
  readonly persist: (intent: PositionOrderInput) => Promise<void>;
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
    mutationFn: persist,
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
      if (!current) throw new Error("The saved order changed");

      const items = current.pages.flatMap((page) => page.items);
      const movedIdSet = new Set(intent.movedIds);
      const movedItems = items.filter((item) => movedIdSet.has(item.id));
      if (movedItems.length !== intent.movedIds.length) {
        throw new Error("The saved order changed");
      }
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
        if (anchorIndex === -1) {
          throw new Error("The saved order changed");
        }
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
    onError: async (_error, _intent, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      await queryClient.refetchQueries({ queryKey, exact: true });
      toast.add({
        type: "error",
        title: failureTitle,
      });
    },
    onSettled: (_data, error) => {
      const pendingMoves = pendingMovesOf(queryClient);
      const remaining = (pendingMoves.get(moveKey) ?? 1) - 1;
      if (remaining > 0) {
        pendingMoves.set(moveKey, remaining);
        return;
      }
      pendingMoves.delete(moveKey);
      if (!error) void queryClient.refetchQueries({ queryKey, exact: true, type: "active" });
    },
  });

  return { move: mutation.mutateAsync, isPending: mutation.isPending } as const;
}
