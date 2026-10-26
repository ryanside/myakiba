import { Delete02Icon, Edit03Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BackLink } from "@/components/ui/back-link";
import { InfiniteListStatus } from "@/components/lists/infinite-list-status";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import { ListMemberGrid, memberImages } from "@/components/lists/list-member-grid";
import { ListMembersActionBar } from "@/components/lists/list-members-action-bar";
import { MediaViewSkeletons } from "@/components/media-tile";
import { LIST_HEADING_CLASS_NAME, ListHeading } from "@/components/lists/list-heading";
import { LoadError, STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Folder } from "@/components/ui/folder";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewToggle } from "@/components/ui/view-toggle";
import {
  useListMembersQuery,
  useListMutations,
  useListQuery,
  useMoveListMembersMutation,
  useRemoveListMembersMutation,
} from "@/hooks/use-lists";
import { VIEW_PREFERENCES, useViewPreference } from "@/lib/layout-preferences";
import { useSelection } from "@/hooks/use-selection";
import { useCallback, useMemo } from "react";

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
  const folderImages = useMemo(
    () => [...new Set(members.flatMap((member) => memberImages(member)))].slice(0, 4),
    [members],
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
  const [viewMode, setViewMode] = useViewPreference(VIEW_PREFERENCES.lists);
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
      <div className="flex flex-col gap-1">
        <BackLink to="/lists" text="All Lists" font="sans" className="self-start" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div aria-hidden="true" className="w-[5.625rem] shrink-0">
              {isPending ? (
                <Skeleton className="aspect-[200/160] w-full rounded-[12%/15%]" />
              ) : (
                <Folder images={folderImages} enter compact />
              )}
            </div>
            {!isPending && data ? (
              <ListHeading
                key={`${data.title}\n${data.description}`}
                title={data.title}
                description={data.description}
                count={
                  !hasInitialError && totalCount > 0
                    ? `${totalCount.toLocaleString()} in this List`
                    : null
                }
              />
            ) : (
              <div className={LIST_HEADING_CLASS_NAME}>
                <h1 className="flex h-8 items-center">
                  <Skeleton className="h-7 w-48 max-w-full" />
                </h1>
                <div className="flex h-5 items-center">
                  <Skeleton className="h-3.5 w-80 max-w-full" />
                </div>
                <div className="flex h-5 items-center">
                  <Skeleton className="h-3.5 w-24" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 sm:h-18 sm:justify-end">
            <ViewToggle
              modes={VIEW_PREFERENCES.lists.modes}
              value={viewMode}
              onValueChange={setViewMode}
            />
            <div className="flex items-center gap-2">
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
                    onSubmit={async (input) => {
                      await updateList({ listId, ...input });
                    }}
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
        </div>
      </div>

      <ListMembersActionBar
        selectedMemberIds={selectedMemberIds}
        isRemoving={removeMembersMutation.isPending}
        onClearSelection={() => setSelection({})}
        onRemoveMembers={async (memberIds) => {
          await removeMembersMutation.mutateAsync(memberIds);
        }}
      />

      {isPending ? (
        <MediaViewSkeletons viewMode={viewMode} count={viewMode === "list" ? 4 : 5} />
      ) : null}

      {hasInitialError ? (
        <LoadError
          title="Couldn't load this List"
          message={loadError?.message ?? "Failed to load List"}
        />
      ) : null}

      {!isPending && !hasInitialError && totalCount === 0 ? (
        <Empty className={STATE_PANEL_CLASS_NAME}>
          <EmptyHeader>
            <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
              <HugeiconsIcon icon={FolderOpenIcon} className="size-5" aria-hidden="true" />
            </EmptyMedia>
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
          onMove={async (intent) => {
            await handleMove(intent);
          }}
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
        <InfiniteListStatus
          hasNextPage={membersQuery.hasNextPage}
          isFetchingNextPage={membersQuery.isFetchingNextPage}
          isFetchNextPageError={membersQuery.isFetchNextPageError}
          disabled={removeMembersMutation.isPending}
          onLoadMore={handleLoadMore}
        />
      ) : null}
    </div>
  );
}
