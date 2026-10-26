import { Add01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSortable } from "@dnd-kit/sortable";
import type { ListInput } from "@myakiba/contracts/lists/schema";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback } from "react";
import type { AnimationEvent, ComponentProps } from "react";
import type { getLists } from "@/queries/lists";
import { InfiniteListStatus } from "@/components/lists/infinite-list-status";
import { ListControls } from "@/components/lists/list-controls";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import { ListsActionBar } from "@/components/lists/lists-action-bar";
import {
  DropIndicator,
  MediaRow,
  MediaRowTitle,
  MediaViewCollection,
  MediaViewSkeletons,
} from "@/components/media-tile";
import { PageHeader, formatCount } from "@/components/page-header";
import { DragHandle, SortableMediaCollection } from "@/components/sortable-media-collection";
import { LoadError, STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Folder, FolderLabel } from "@/components/ui/folder";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewToggle } from "@/components/ui/view-toggle";
import type { GridListViewMode } from "@/components/ui/view-toggle";
import { useListMutations, useListsQuery, useMoveListsMutation } from "@/hooks/use-lists";
import { VIEW_PREFERENCES, useViewPreference } from "@/lib/layout-preferences";
import { cn } from "@/lib/utils";
import { useSelection } from "@/hooks/use-selection";
import { useSortableItems } from "@/hooks/use-sortable-items";

type ListsPage = NonNullable<Awaited<ReturnType<typeof getLists>>>;
type ListRecord = ListsPage["items"][number];
export const Route = createFileRoute("/(app)/lists")({
  component: RouteComponent,
  head: () => ({
    meta: [{ name: "description", content: "your Lists" }, { title: "Lists - myakiba" }],
  }),
});

// Firefox applies the @3xl gaps one style pass late, and the reduced-motion rule would animate the jump.
const FOLDER_GRID_CLASS_NAME =
  "grid grid-cols-2 gap-3 transition-none @3xl:grid-cols-3 @3xl:gap-x-8 @3xl:gap-y-6";

const FOLDER_DROP = {
  before: "inset-y-2 -left-[7px] w-0.5 @3xl:-left-[17px]",
  after: "inset-y-2 -right-[7px] w-0.5 @3xl:-right-[17px]",
};

function SortableList({
  list,
  viewMode,
  entranceAnimationActive,
  sortingDisabled,
  selected,
  dropIndicator,
  onToggleSelection,
  onUpdate,
  onDelete,
  onEntranceAnimationEnd,
}: {
  readonly list: ListRecord;
  readonly viewMode: GridListViewMode;
  readonly entranceAnimationActive: boolean;
  readonly sortingDisabled: boolean;
  readonly selected: boolean;
  readonly dropIndicator?: "before" | "after";
  readonly onToggleSelection: () => void;
  readonly onUpdate: (listId: string, input: ListInput) => Promise<void>;
  readonly onDelete: (listId: string) => Promise<void>;
  readonly onEntranceAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
}): React.JSX.Element {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useSortable({
    id: list.id,
    disabled: sortingDisabled,
  });

  const controls = (
    <ListControls
      list={list}
      viewMode={viewMode}
      selected={selected}
      active={isDragging}
      onToggleSelection={onToggleSelection}
      onUpdate={onUpdate}
      onDelete={onDelete}
    >
      <DragHandle
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        label={`Reorder ${list.title}`}
        disabled={sortingDisabled}
      />
    </ListControls>
  );

  if (viewMode === "list") {
    return (
      <div ref={setNodeRef} className="relative">
        <MediaRow
          selected={selected}
          dropIndicator={dropIndicator}
          data-folder-host
          className={cn(entranceAnimationActive && "animate-data-in")}
          onAnimationEnd={onEntranceAnimationEnd}
          controls={controls}
        >
          <span className="flex size-16 shrink-0 items-center">
            <Folder images={list.images} compact className="w-full" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch py-0.5">
            <MediaRowTitle
              title={list.title}
              destination={{ to: "/lists/$listId", params: { listId: list.id } }}
            />
            {list.description ? (
              <span
                className="truncate text-xs leading-4 text-muted-foreground"
                title={list.description}
              >
                {list.description}
              </span>
            ) : null}
          </span>
        </MediaRow>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className="relative">
      <DropIndicator placement={dropIndicator} geometry={FOLDER_DROP} />
      <div
        data-folder-host
        className={cn(
          "group/item relative rounded-[1.75rem] px-1.5 pt-[15%] pb-1.5 outline-offset-2 outline-ring has-[a:focus-visible]:outline-2",
          selected && "bg-foreground/[0.045] ring-2 ring-primary",
          entranceAnimationActive && "animate-data-in",
        )}
        onAnimationEnd={onEntranceAnimationEnd}
      >
        <Link
          to="/lists/$listId"
          params={{ listId: list.id }}
          className="block rounded-[inherit] outline-none"
        >
          <Folder images={list.images}>
            <FolderLabel title={list.title} description={list.description} />
          </Folder>
        </Link>
        {controls}
      </div>
    </div>
  );
}

function FolderSkeletons(): React.JSX.Element {
  return (
    <div className="@container" aria-hidden="true">
      <div className={FOLDER_GRID_CLASS_NAME}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="px-1.5 pt-[15%] pb-1.5">
            <div className="relative aspect-[200/160]">
              <Skeleton className="absolute top-0 left-[8%] h-[10%] w-[40%] rounded-t-xl rounded-b-none" />
              <Skeleton className="absolute inset-x-0 top-[9.4%] bottom-0 rounded-[6%/7.5%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListsLayout({
  viewMode,
  className,
  ...props
}: ComponentProps<"div"> & { readonly viewMode: GridListViewMode }): React.JSX.Element {
  if (viewMode === "list") {
    return <MediaViewCollection viewMode="list" className={className} {...props} />;
  }
  return (
    <div className="@container">
      <div className={cn(FOLDER_GRID_CLASS_NAME, className)} {...props} />
    </div>
  );
}

function SortableLists({
  lists,
  viewMode,
  totalCount,
  isSaving,
  sortingDisabled,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onUpdate,
  onDelete,
  onMove,
  selectedIds,
  onClearSelection,
  onToggleSelection,
}: {
  readonly lists: ListRecord[];
  readonly viewMode: GridListViewMode;
  readonly totalCount: number;
  readonly isSaving: boolean;
  readonly sortingDisabled: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => Promise<{ readonly isFetchNextPageError: boolean }>;
  readonly onUpdate: (listId: string, input: ListInput) => Promise<void>;
  readonly onDelete: (listId: string) => Promise<void>;
  readonly onMove: (intent: PositionOrderInput) => Promise<void>;
  readonly selectedIds: ReadonlySet<string>;
  readonly onClearSelection: () => void;
  readonly onToggleSelection: (listId: string, selected: boolean) => void;
}): React.JSX.Element {
  const sortable = useSortableItems({
    items: lists,
    totalCount,
    selectedIds,
    selectedLabel: "selected Lists",
    fallbackLabel: "List",
    screenReaderInstruction:
      "To move a List, press Space. Use the arrow keys to choose a new position, then press Space to drop it. Press Escape to cancel.",
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    onMove,
    onClearSelection,
  });

  return (
    <SortableMediaCollection sortable={sortable} vertical={viewMode === "list"}>
      <ListsLayout
        viewMode={viewMode}
        className={cn(sortable.activeId && "pointer-events-none")}
        aria-busy={isSaving}
      >
        {lists.map((list) => (
          <SortableList
            key={list.id}
            list={list}
            viewMode={viewMode}
            entranceAnimationActive={sortable.entranceAnimationActive}
            sortingDisabled={sortingDisabled || isSaving || lists.length < 2}
            selected={selectedIds.has(list.id)}
            dropIndicator={sortable.dropPlacement(list.id)}
            onToggleSelection={() => onToggleSelection(list.id, !selectedIds.has(list.id))}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onEntranceAnimationEnd={sortable.entranceAnimationEnd(list.id)}
          />
        ))}
      </ListsLayout>
    </SortableMediaCollection>
  );
}

function RouteComponent(): React.JSX.Element {
  const {
    data,
    isPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage: handleLoadMore,
  } = useListsQuery();
  const lists = data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;
  const { createList, updateList, deleteList, deleteLists, isDeleting } = useListMutations();
  const moveMutation = useMoveListsMutation();
  const handleMove = moveMutation.move;
  // List detail shares this key and may store "gallery", which the index shows as its grid.
  const [storedViewMode, setViewMode] = useViewPreference(VIEW_PREFERENCES.lists);
  const viewMode: GridListViewMode = storedViewMode === "list" ? "list" : "grid";
  const { selectedIds, setSelection } = useSelection();
  const handleDeleteList = useCallback(
    async (listId: string): Promise<void> => {
      await deleteList(listId);
      setSelection((current) => {
        const { [listId]: _removed, ...next } = current;
        return next;
      });
    },
    [deleteList, setSelection],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Lists"
        meta={isPending || (isError && !data) ? null : formatCount(totalCount, "List", "Lists")}
        actions={
          <>
            <ViewToggle modes={["grid", "list"]} value={viewMode} onValueChange={setViewMode} />
            <ListFormDialog
              renderTrigger={
                <Button variant="default">
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
                  New List
                </Button>
              }
              title="Create List"
              description="Give your new List a title and an optional description."
              submitLabel="Create"
              onSubmit={async (input) => {
                await createList(input);
              }}
            />
          </>
        }
      />

      <ListsActionBar
        selectedListIds={selectedIds}
        isDeleting={isDeleting}
        onClearSelection={() => setSelection({})}
        onDeleteLists={deleteLists}
      />

      {isPending && viewMode === "grid" ? <FolderSkeletons /> : null}

      {isPending && viewMode === "list" ? <MediaViewSkeletons viewMode="list" count={4} /> : null}

      {isError && !data ? (
        <LoadError title="Couldn't load your Lists" message={error.message} />
      ) : null}

      {!isPending && data && lists.length === 0 ? (
        <Empty className={STATE_PANEL_CLASS_NAME}>
          <EmptyHeader>
            <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
              <HugeiconsIcon icon={Folder01Icon} className="size-5" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No Lists yet</EmptyTitle>
            <EmptyDescription>Create a List to start organizing.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!isPending && data && lists.length > 0 ? (
        <SortableLists
          lists={lists}
          viewMode={viewMode}
          totalCount={totalCount}
          isSaving={moveMutation.isPending}
          sortingDisabled={isDeleting}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={handleLoadMore}
          onUpdate={async (listId, input) => {
            await updateList({ listId, ...input });
          }}
          onDelete={handleDeleteList}
          onMove={async (intent) => {
            await handleMove(intent);
          }}
          selectedIds={selectedIds}
          onClearSelection={() => setSelection({})}
          onToggleSelection={(listId, selected) => {
            setSelection((current) => {
              if (selected) return { ...current, [listId]: true };
              const { [listId]: _removed, ...next } = current;
              return next;
            });
          }}
        />
      ) : null}

      {!isPending && data ? (
        <InfiniteListStatus
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isFetchNextPageError={isFetchNextPageError}
          disabled={isDeleting}
          onLoadMore={handleLoadMore}
        />
      ) : null}
    </div>
  );
}
