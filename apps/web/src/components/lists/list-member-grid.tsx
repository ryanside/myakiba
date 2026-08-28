import { DragDropVerticalIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  ScreenReaderInstructions,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ListOrderInput } from "@myakiba/contracts/lists/schema";
import { Link } from "@tanstack/react-router";
import type { getListMembers } from "@/queries/lists";
import { ListMemberControls } from "@/components/lists/list-member-controls";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { ItemControl } from "@/components/ui/item-controls";
import { toast } from "@/components/ui/toast";
import type { ListViewMode } from "@/components/lists/list-view-toggle";
import { cn } from "@/lib/utils";
import { startTransition, useCallback, useMemo, useOptimistic, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { moveSortableSelection } from "@/components/lists/list-order";

type ListMembersPage = NonNullable<Awaited<ReturnType<typeof getListMembers>>>;
type ListMember = ListMembersPage["items"][number];

const GRID_TILE_SIZE = 180;
const MAX_STAGGER_INDEX = 20;
const STAGGER_DELAY_MS = 30;

const MEMBER_TYPE_LABELS = {
  item: "Item",
  collectionItem: "Collection Item",
  order: "Order",
} as const;

function ListMemberImage({ member }: { readonly member: ListMember }): React.JSX.Element {
  if (member.type === "order") {
    return (
      <ImageThumbnail
        images={member.images}
        title={member.title}
        fallbackIcon={
          <HugeiconsIcon icon={PackageIcon} className="size-10 text-muted-foreground/40" />
        }
        className="aspect-square w-full"
        decorative
        loading="lazy"
      />
    );
  }

  if (member.image) {
    return (
      <img
        src={member.image}
        alt=""
        className="aspect-square w-full object-cover object-top"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex aspect-square w-full items-center justify-center bg-muted">
      <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
    </div>
  );
}

function ListMemberLink({
  member,
  viewMode,
}: {
  readonly member: ListMember;
  readonly viewMode: ListViewMode;
}): React.JSX.Element {
  const content = (
    <>
      <div
        className={cn(
          "shrink-0",
          viewMode === "grid" ? "aspect-square w-full" : "size-16 overflow-hidden rounded-md",
        )}
      >
        <ListMemberImage member={member} />
      </div>
      {viewMode === "grid" ? (
        <div
          key="grid-metadata"
          className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-black/50 p-2.5 text-white opacity-0 backdrop-blur-sm transition-[translate,opacity] duration-150 ease-out group-hover/media:translate-y-0 group-hover/media:opacity-100 group-focus-visible/media:translate-y-0 group-focus-visible/media:opacity-100 any-pointer-coarse:translate-y-0 any-pointer-coarse:opacity-100"
        >
          <p className="line-clamp-2 text-sm font-medium leading-tight">{member.title}</p>
          <p className="mt-1 text-xs leading-4 text-white/70">{MEMBER_TYPE_LABELS[member.type]}</p>
        </div>
      ) : (
        <div key="list-metadata" className="flex min-w-0 flex-1 flex-col self-stretch py-0.5">
          <p className="truncate text-sm font-medium leading-tight" title={member.title}>
            {member.title}
          </p>
          <div className="mt-auto pt-1.5">
            <p className="text-[11px] leading-4 text-muted-foreground">Type</p>
            <p className="text-xs leading-4">{MEMBER_TYPE_LABELS[member.type]}</p>
          </div>
        </div>
      )}
    </>
  );
  const className = cn(
    "group/media focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    viewMode === "grid" ? "block" : "flex min-w-0 flex-1 items-center gap-3 p-2",
  );

  if (member.type === "order") {
    return (
      <Link to="/orders/$id" params={{ id: member.targetId }} className={className}>
        {content}
      </Link>
    );
  }

  if (member.itemExternalId !== null) {
    return (
      <Link
        to="/item/$externalId"
        params={{ externalId: member.itemExternalId }}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <Link
      to="/item/custom/$id"
      params={{ id: member.type === "item" ? member.targetId : member.itemId }}
      className={className}
    >
      {content}
    </Link>
  );
}

function SortableListMember({
  member,
  index,
  viewMode,
  entranceAnimationActive,
  sortingDisabled,
  removingMemberIds,
  selected,
  dropIndicator,
  onToggleSelection,
  onRemove,
  onEntranceAnimationEnd,
}: {
  readonly member: ListMember;
  readonly index: number;
  readonly viewMode: ListViewMode;
  readonly entranceAnimationActive: boolean;
  readonly sortingDisabled: boolean;
  readonly removingMemberIds: readonly string[] | undefined;
  readonly selected: boolean;
  readonly dropIndicator?: "before" | "after";
  readonly onToggleSelection: () => void;
  readonly onRemove: (memberId: string) => Promise<void>;
  readonly onEntranceAnimationEnd?: () => void;
}): React.JSX.Element {
  const removeDisabled = removingMemberIds !== undefined;
  const reorderDisabled = sortingDisabled || removeDisabled;
  const { attributes, isDragging, listeners, setNodeRef } = useSortable({
    id: member.id,
    disabled: reorderDisabled,
  });
  const isRemoving = removingMemberIds?.includes(member.id) ?? false;
  const entranceStyle = entranceAnimationActive
    ? ({
        "--data-in-delay": `${Math.min(index, MAX_STAGGER_INDEX) * STAGGER_DELAY_MS}ms`,
      } as CSSProperties)
    : undefined;

  return (
    <div ref={setNodeRef} className="relative">
      {dropIndicator ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-30 rounded-full bg-primary",
            viewMode === "grid" ? "inset-y-2 w-0.5" : "inset-x-2 h-0.5",
            viewMode === "grid" && dropIndicator === "before" && "-left-1",
            viewMode === "grid" && dropIndicator === "after" && "-right-1",
            viewMode === "list" && dropIndicator === "before" && "top-0 -translate-y-1/2",
            viewMode === "list" && dropIndicator === "after" && "bottom-0 translate-y-1/2",
          )}
        />
      ) : null}
      <div
        className={cn(
          "group/item relative overflow-hidden",
          viewMode === "grid"
            ? "group/tile rounded-lg"
            : "group/row flex min-w-0 items-center rounded-md transition-colors duration-50 hover:bg-accent",
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
        <ListMemberLink member={member} viewMode={viewMode} />
        <ListMemberControls
          member={member}
          viewMode={viewMode}
          selected={selected}
          active={isDragging}
          removeDisabled={removeDisabled}
          isRemoving={isRemoving}
          onToggleSelection={onToggleSelection}
          onRemove={onRemove}
        >
          <ItemControl
            type="button"
            className="touch-none cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${member.title}`}
            title="Drag to reorder"
            disabled={reorderDisabled}
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} aria-hidden="true" />
          </ItemControl>
        </ListMemberControls>
      </div>
    </div>
  );
}

export function ListMemberGrid({
  members,
  viewMode,
  totalCount,
  isSaving,
  sortingDisabled,
  removingMemberIds,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onRemove,
  onMove,
  selectedIds,
  onClearSelection,
  onToggleSelection,
}: {
  readonly members: readonly ListMember[];
  readonly viewMode: ListViewMode;
  readonly totalCount: number;
  readonly isSaving: boolean;
  readonly sortingDisabled: boolean;
  readonly removingMemberIds: readonly string[] | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => Promise<{ readonly isFetchNextPageError: boolean }>;
  readonly onRemove: (memberId: string) => Promise<void>;
  readonly onMove: (intent: ListOrderInput) => Promise<unknown>;
  readonly selectedIds: ReadonlySet<string>;
  readonly onClearSelection: () => void;
  readonly onToggleSelection: (memberId: string, selected: boolean) => void;
}): React.JSX.Element {
  const [orderedMembers, setOrderedMembers] = useOptimistic(members);
  const [entranceAnimationActive, setEntranceAnimationActive] = useState(true);
  const [dndEpoch, setDndEpoch] = useState(0);
  const [activeMemberId, setActiveMemberId] = useState<string>();
  const [overMemberId, setOverMemberId] = useState<string>();
  const keyboardDrag = useRef(false);
  const loadingNextPage = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const memberIds = useMemo(() => orderedMembers.map((member) => member.id), [orderedMembers]);
  const draggingSelection = activeMemberId ? selectedIds.has(activeMemberId) : false;
  let draggedMemberCount = 0;
  if (activeMemberId) draggedMemberCount = draggingSelection ? selectedIds.size : 1;

  const activeIndex = activeMemberId ? memberIds.indexOf(activeMemberId) : -1;
  const overIndex = overMemberId ? memberIds.indexOf(overMemberId) : -1;
  const dropIndicator = useMemo(
    () =>
      activeIndex >= 0 &&
      overIndex >= 0 &&
      activeMemberId !== overMemberId &&
      !(draggingSelection && overMemberId && selectedIds.has(overMemberId))
        ? {
            id: overMemberId,
            placement: activeIndex < overIndex ? ("after" as const) : ("before" as const),
          }
        : null,
    [activeIndex, activeMemberId, draggingSelection, overIndex, overMemberId, selectedIds],
  );

  const announcements = useMemo<Announcements>(() => {
    const titleById = new Map(orderedMembers.map((member) => [member.id, member.title]));
    const getTitle = (id: string | number) => {
      const memberId = String(id);
      if (selectedIds.size > 1 && selectedIds.has(memberId)) {
        return `${selectedIds.size} selected`;
      }
      return titleById.get(memberId) ?? "selection";
    };
    return {
      onDragStart: ({ active }) => `Picked up ${getTitle(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${getTitle(active.id)} is over position ${orderedMembers.findIndex((member) => member.id === String(over.id)) + 1} of ${totalCount}.`
          : `${getTitle(active.id)} is no longer over a drop target.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `Dropped ${getTitle(active.id)} at position ${orderedMembers.findIndex((member) => member.id === String(over.id)) + 1} of ${totalCount}.`
          : `Movement cancelled for ${getTitle(active.id)}.`,
      onDragCancel: ({ active }) => `Movement cancelled for ${getTitle(active.id)}.`,
    };
  }, [orderedMembers, selectedIds, totalCount]);

  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable:
      "To reorder, press Space. Use the arrow keys to choose a new position, then press Space to drop it. Press Escape to cancel.",
  };

  const handleDragStart = useCallback(({ active, activatorEvent }: DragStartEvent): void => {
    setEntranceAnimationActive(false);
    keyboardDrag.current = activatorEvent instanceof KeyboardEvent;
    setActiveMemberId(String(active.id));
  }, []);

  const handleDragOver = useCallback(
    async ({ active, over }: DragOverEvent): Promise<void> => {
      setActiveMemberId(String(active.id));
      setOverMemberId(over ? String(over.id) : undefined);
      if (
        !(keyboardDrag.current && over && hasNextPage) ||
        isFetchingNextPage ||
        loadingNextPage.current
      ) {
        return;
      }
      const hoveredIndex = memberIds.indexOf(String(over.id));
      if (hoveredIndex < memberIds.length - 2) return;

      loadingNextPage.current = true;
      const result = await onLoadMore();
      loadingNextPage.current = false;
      if (!(keyboardDrag.current && result.isFetchNextPageError)) return;

      setDndEpoch((epoch) => epoch + 1);
      keyboardDrag.current = false;
      setActiveMemberId(undefined);
      setOverMemberId(undefined);
      const toastId = toast.add({
        type: "error",
        title: "Could not load more. Your saved order has not changed.",
        actionProps: {
          children: "Retry",
          onClick() {
            toast.close(toastId);
            void onLoadMore();
          },
        },
      });
    },
    [hasNextPage, isFetchingNextPage, memberIds, onLoadMore],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent): void => {
      keyboardDrag.current = false;
      setActiveMemberId(undefined);
      setOverMemberId(undefined);
      if (!over) return;

      const move = moveSortableSelection(
        orderedMembers,
        String(active.id),
        String(over.id),
        selectedIds,
      );
      onClearSelection();
      if (!move) return;

      startTransition(async () => {
        setOrderedMembers(move.items);
        await onMove(move.intent).catch(() => null);
      });
    },
    [onClearSelection, onMove, orderedMembers, selectedIds, setOrderedMembers],
  );

  const handleDragCancel = useCallback((): void => {
    keyboardDrag.current = false;
    setActiveMemberId(undefined);
    setOverMemberId(undefined);
  }, []);

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
        items={memberIds}
        strategy={viewMode === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <div
          className={cn(
            viewMode === "grid" ? "grid gap-2" : "flex flex-col gap-2",
            activeMemberId && "pointer-events-none",
          )}
          style={
            viewMode === "grid"
              ? { gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_TILE_SIZE}px, 1fr))` }
              : undefined
          }
          aria-busy={isSaving}
        >
          {orderedMembers.map((member, index) => (
            <SortableListMember
              key={member.id}
              member={member}
              index={index}
              viewMode={viewMode}
              entranceAnimationActive={entranceAnimationActive}
              sortingDisabled={sortingDisabled || orderedMembers.length < 2}
              removingMemberIds={removingMemberIds}
              selected={selectedIds.has(member.id)}
              dropIndicator={member.id === dropIndicator?.id ? dropIndicator.placement : undefined}
              onToggleSelection={() => onToggleSelection(member.id, !selectedIds.has(member.id))}
              onRemove={onRemove}
              onEntranceAnimationEnd={
                index === orderedMembers.length - 1
                  ? () => setEntranceAnimationActive(false)
                  : undefined
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
        {activeMemberId ? (
          <div
            aria-hidden="true"
            className="rounded-lg bg-popover px-2.5 py-1.5 text-sm font-medium text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {draggedMemberCount} selected
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
