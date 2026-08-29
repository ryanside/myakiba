import { Delete02Icon, Edit03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BackLink } from "@/components/ui/back-link";
import { InfiniteListStatus } from "@/components/lists/infinite-list-status";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import { ListMemberGrid } from "@/components/lists/list-member-grid";
import { ListMembersActionBar } from "@/components/lists/list-members-action-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewToggle } from "@/components/ui/view-toggle";
import type { GridListViewMode } from "@/components/ui/view-toggle";
import {
  useListMembersQuery,
  useListMutations,
  useListQuery,
  useMoveListMembersMutation,
  useRemoveListMembersMutation,
} from "@/hooks/use-lists";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSelection } from "@/hooks/use-selection";
import { useCallback, useMemo } from "react";

const VIEW_MODE_KEY = "lists:viewMode";

export const Route = createFileRoute("/(app)/lists_/$listId")({
  component: RouteComponent,
  remountDeps: ({ params }) => params.listId,
  head: ({ params }) => ({
    meta: [{ name: "description", content: `List ${params.listId}` }, { title: "List - myakiba" }],
  }),
});

function RouteComponent(): React.JSX.Element {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const listQuery = useListQuery(listId);
  const membersQuery = useListMembersQuery(listId);
  const data = listQuery.data;
  const members = useMemo(
    () => membersQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [membersQuery.data?.pages],
  );
  const totalCount = membersQuery.data?.pages[0]?.totalCount ?? 0;
  const isPending = listQuery.isPending || membersQuery.isPending;
  const loadError = listQuery.error ?? membersQuery.error;
  const hasInitialError =
    (listQuery.isError && !listQuery.data) || (membersQuery.isError && !membersQuery.data);
  const { updateList, deleteList } = useListMutations();
  const removeMembersMutation = useRemoveListMembersMutation(listId);
  const moveMutation = useMoveListMembersMutation(listId);
  const handleLoadMore = membersQuery.fetchNextPage;
  const handleMove = moveMutation.move;
  const [viewMode, setViewMode] = useLocalStorage<GridListViewMode>(VIEW_MODE_KEY, "grid");
  const { selectedIds, setSelection } = useSelection();
  const removeMembers = removeMembersMutation.mutateAsync;
  const selectedMemberIds = useMemo(() => [...selectedIds], [selectedIds]);
  const handleRemove = useCallback(
    async (memberId: string): Promise<void> => {
      await removeMembers([memberId]);
      setSelection((current) => {
        const { [memberId]: _removed, ...next } = current;
        return next;
      });
    },
    [removeMembers, setSelection],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6" aria-busy={isPending}>
      <BackLink to="/lists" text="All Lists" font="sans" className="self-start" />

      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1
            className={
              data
                ? "animate-data-in break-words font-heading text-2xl font-medium tracking-tight"
                : "break-words font-heading text-2xl font-medium tracking-tight"
            }
          >
            {data?.title ?? <Skeleton className="h-8 w-48" />}
          </h1>
          {isPending ? (
            <div className="mt-1 flex h-5 items-center">
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          ) : null}
          {!isPending && data?.description ? (
            <p className="animate-data-in mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {data.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <ViewToggle modes={["grid", "list"]} value={viewMode} onValueChange={setViewMode} />
          {isPending ? (
            <>
              <Button variant="outline" disabled>
                <HugeiconsIcon icon={Edit03Icon} data-icon="inline-start" />
                Edit
              </Button>
              <Button variant="destructive" disabled>
                <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                Delete
              </Button>
            </>
          ) : null}
          {!isPending && data ? (
            <>
              <ListFormDialog
                renderTrigger={
                  <Button variant="outline">
                    <HugeiconsIcon icon={Edit03Icon} data-icon="inline-start" />
                    Edit
                  </Button>
                }
                title="Edit List"
                description="Change this List's title or description."
                initialTitle={data.title}
                initialDescription={data.description}
                submitLabel="Save"
                pendingLabel="Saving..."
                onSubmit={(input) => updateList({ listId, ...input })}
              />
              <ConfirmDialog
                renderTrigger={
                  <Button variant="destructive">
                    <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                    Delete
                  </Button>
                }
                title="Delete List?"
                description="This removes the List. Its Items, Collection Items, and Orders will not be deleted."
                onConfirm={async () => {
                  await deleteList(listId);
                  await navigate({ to: "/lists" });
                }}
              />
            </>
          ) : null}
        </div>
      </div>

      <ListMembersActionBar
        selectedMemberIds={selectedMemberIds}
        isRemoving={removeMembersMutation.isPending}
        onClearSelection={() => setSelection({})}
        onRemoveMembers={removeMembersMutation.mutateAsync}
      />

      {isPending && viewMode === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {isPending && viewMode === "list" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-2">
              <Skeleton className="size-16 shrink-0 rounded-md" />
              <div className="flex h-16 flex-1 flex-col py-0.5">
                <Skeleton className="h-4 w-3/4" />
                <div className="mt-auto space-y-1 pt-1.5">
                  <Skeleton className="h-2.5 w-12" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="mr-1 flex shrink-0 gap-1 p-0.5">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {hasInitialError ? (
        <div className="flex h-64 items-center justify-center text-lg font-medium text-destructive">
          Error: {loadError?.message ?? "Failed to load List"}
        </div>
      ) : null}

      {!isPending && !hasInitialError && totalCount === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyTitle>This List is empty</EmptyTitle>
            <EmptyDescription>
              Add any Item, Collection Item, or Order from its existing page.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Link to="/items" className={buttonVariants({ variant: "outline" })}>
              Item Database
            </Link>
            <Link to="/collection" className={buttonVariants({ variant: "outline" })}>
              Collection
            </Link>
            <Link to="/orders" className={buttonVariants({ variant: "outline" })}>
              Orders
            </Link>
          </EmptyContent>
        </Empty>
      ) : null}

      {!isPending && !hasInitialError && members.length > 0 ? (
        <ListMemberGrid
          members={members}
          viewMode={viewMode}
          totalCount={totalCount}
          isSaving={moveMutation.isPending}
          sortingDisabled={removeMembersMutation.isPending}
          removingMemberIds={
            removeMembersMutation.isPending ? removeMembersMutation.variables : undefined
          }
          hasNextPage={membersQuery.hasNextPage}
          isFetchingNextPage={membersQuery.isFetchingNextPage}
          onLoadMore={handleLoadMore}
          onRemove={handleRemove}
          onMove={handleMove}
          selectedIds={selectedIds}
          onClearSelection={() => setSelection({})}
          onToggleSelection={(memberId, selected) => {
            setSelection((current) => {
              if (selected) return { ...current, [memberId]: true };
              const { [memberId]: _removed, ...next } = current;
              return next;
            });
          }}
        />
      ) : null}

      {!isPending && !hasInitialError && totalCount > 0 ? (
        <>
          <InfiniteListStatus
            hasNextPage={membersQuery.hasNextPage}
            isFetchingNextPage={membersQuery.isFetchingNextPage}
            isFetchNextPageError={membersQuery.isFetchNextPageError}
            disabled={removeMembersMutation.isPending}
            onLoadMore={handleLoadMore}
          />
          <p className="text-sm text-muted-foreground">{totalCount.toLocaleString()} total</p>
        </>
      ) : null}
    </div>
  );
}
