import { Add01Icon, DragDropVerticalIcon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { closestCenter, DndContext, DragOverlay } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ListInput, ListOrderInput } from "@myakiba/contracts/lists/schema";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback } from "react";
import type { CSSProperties } from "react";
import type { getLists } from "@/queries/lists";
import { InfiniteListStatus } from "@/components/lists/infinite-list-status";
import { ListControls } from "@/components/lists/list-controls";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import { ListsActionBar } from "@/components/lists/lists-action-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ItemControl } from "@/components/ui/item-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { ViewToggle } from "@/components/ui/view-toggle";
import type { GridListViewMode } from "@/components/ui/view-toggle";
import { useListMutations, useListsQuery, useMoveListsMutation } from "@/hooks/use-lists";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { useSelection } from "@/hooks/use-selection";
import { useSortableSelection } from "@/components/lists/use-sortable-selection";

type ListsPage = NonNullable<Awaited<ReturnType<typeof getLists>>>;
type ListRecord = ListsPage["items"][number];
const VIEW_MODE_KEY = "lists:viewMode";
const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;
export const Route = createFileRoute("/(app)/lists")({
  component: RouteComponent,
  head: () => ({
    meta: [{ name: "description", content: "your Lists" }, { title: "Lists - myakiba" }],
  }),
});

function SortableList({
  list,
  index,
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
  readonly index: number;
  readonly viewMode: GridListViewMode;
  readonly entranceAnimationActive: boolean;
  readonly sortingDisabled: boolean;
  readonly selected: boolean;
  readonly dropIndicator?: "before" | "after";
  readonly onToggleSelection: () => void;
  readonly onUpdate: (listId: string, input: ListInput) => Promise<void>;
  readonly onDelete: (listId: string) => Promise<void>;
  readonly onEntranceAnimationEnd?: () => void;
}): React.JSX.Element {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useSortable({
    id: list.id,
    disabled: sortingDisabled,
  });
  const entranceStyle = entranceAnimationActive
    ? ({
        "--data-in-delay": `${Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS}ms`,
      } as CSSProperties)
    : undefined;
  const previewClassName =
    viewMode === "grid"
      ? "size-16 shrink-0 rounded-lg"
      : "size-16 shrink-0 overflow-hidden rounded-md";
  const preview =
    list.images.length > 0 ? (
      <ImageThumbnail
        images={list.images}
        title={list.title}
        fallbackIcon={null}
        decorative
        loading="lazy"
        className={`${previewClassName} ring-1 ring-black/10 dark:ring-white/10`}
        showRemainingCount
      />
    ) : (
      <div className={`flex shrink-0 items-center justify-center ${previewClassName}`}>
        <HugeiconsIcon icon={Folder01Icon} className="size-10 text-muted-foreground" />
      </div>
    );

  return (
    <div ref={setNodeRef} className="relative">
      {dropIndicator ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-30 rounded-full bg-primary",
            viewMode === "grid" ? "inset-y-2 w-0.5" : "inset-x-2 h-0.5",
            viewMode === "grid" && dropIndicator === "before" && "-left-1.5",
            viewMode === "grid" && dropIndicator === "after" && "-right-1.5",
            viewMode === "list" && dropIndicator === "before" && "top-0 -translate-y-1/2",
            viewMode === "list" && dropIndicator === "after" && "bottom-0 translate-y-1/2",
          )}
        />
      ) : null}
      <div
        className={cn(
          "group/item relative overflow-hidden",
          viewMode === "grid"
            ? "group/card rounded-xl bg-card ring-1 ring-foreground/10 transition-[box-shadow] duration-150 hover:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            : "group/row flex min-w-0 items-center rounded-md hover:bg-accent",
          selected && "ring-2 ring-primary",
          entranceAnimationActive && "animate-data-in",
        )}
        style={entranceStyle}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === "data-in") {
            onEntranceAnimationEnd?.();
          }
        }}
      >
        <Link
          to="/lists/$listId"
          params={{ listId: list.id }}
          className={cn(
            "flex items-center gap-3 focus-visible:outline-none",
            viewMode === "grid"
              ? "min-h-40 flex-col justify-center p-5 text-center"
              : "min-w-0 flex-1 p-2 focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {preview}
          {viewMode === "grid" ? (
            <span className="line-clamp-2 w-full min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
              {list.title}
            </span>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch py-0.5">
              <p className="truncate text-sm font-medium leading-tight" title={list.title}>
                {list.title}
              </p>
              {list.description ? (
                <p className="truncate text-xs leading-4 text-muted-foreground">
                  {list.description}
                </p>
              ) : null}
            </div>
          )}
        </Link>
        <ListControls
          list={list}
          viewMode={viewMode}
          selected={selected}
          active={isDragging}
          onToggleSelection={onToggleSelection}
          onUpdate={onUpdate}
          onDelete={onDelete}
        >
          <ItemControl
            ref={setActivatorNodeRef}
            type="button"
            className="touch-none cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${list.title}`}
            title="Drag to reorder"
            disabled={sortingDisabled}
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} aria-hidden="true" />
          </ItemControl>
        </ListControls>
      </div>
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
  readonly onMove: (intent: ListOrderInput) => Promise<void>;
  readonly selectedIds: ReadonlySet<string>;
  readonly onClearSelection: () => void;
  readonly onToggleSelection: (listId: string, selected: boolean) => void;
}): React.JSX.Element {
  const {
    itemIds: listIds,
    entranceAnimationActive,
    finishEntranceAnimation,
    dndEpoch,
    activeId: activeListId,
    dropIndicator,
    overlayLabel,
    sensors,
    announcements,
    screenReaderInstructions,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useSortableSelection({
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
    <DndContext
      key={dndEpoch}
      accessibility={{ announcements, screenReaderInstructions }}
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={listIds}
        strategy={viewMode === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <div
          className={cn(
            viewMode === "grid"
              ? "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3"
              : "flex flex-col gap-2",
            activeListId && "pointer-events-none",
          )}
          aria-busy={isSaving}
        >
          {lists.map((list, index) => (
            <SortableList
              key={list.id}
              list={list}
              index={index}
              viewMode={viewMode}
              entranceAnimationActive={entranceAnimationActive}
              sortingDisabled={sortingDisabled || isSaving || lists.length < 2}
              selected={selectedIds.has(list.id)}
              dropIndicator={list.id === dropIndicator?.id ? dropIndicator.placement : undefined}
              onToggleSelection={() => onToggleSelection(list.id, !selectedIds.has(list.id))}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onEntranceAnimationEnd={
                index === lists.length - 1 ? finishEntranceAnimation : undefined
              }
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay
        className="pointer-events-none flex items-center justify-center"
        dropAnimation={null}
        modifiers={[snapCenterToCursor]}
        zIndex={50}
      >
        {activeListId ? (
          <div
            aria-hidden="true"
            className="rounded-lg bg-popover px-2.5 py-1.5 text-sm font-medium text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {overlayLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
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
  const [viewMode, setViewMode] = useLocalStorage<GridListViewMode>(VIEW_MODE_KEY, "grid");
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium tracking-tight">Lists</h1>
        <div className="flex items-center gap-2">
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
            pendingLabel="Creating..."
            onSubmit={async (input) => {
              await createList(input);
            }}
          />
        </div>
      </div>

      <ListsActionBar
        selectedListIds={selectedIds}
        isDeleting={isDeleting}
        onClearSelection={() => setSelection({})}
        onDeleteLists={deleteLists}
      />

      {isPending && viewMode === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : null}

      {isPending && viewMode === "list" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-2">
              <Skeleton className="size-16 shrink-0 rounded-md" />
              <div className="flex h-16 flex-1 flex-col justify-center gap-1.5 py-0.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-36" />
              </div>
              <div className="mr-1 flex shrink-0 gap-1 p-0.5">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {isError && !data ? (
        <div className="flex h-64 items-center justify-center text-lg font-medium text-destructive">
          Error: {error.message}
        </div>
      ) : null}

      {!isPending && data && lists.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
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
          onLoadMore={async () => {
            await handleLoadMore();
          }}
        />
      ) : null}
    </div>
  );
}
