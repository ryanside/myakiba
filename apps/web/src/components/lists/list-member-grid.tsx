import { PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSortable } from "@dnd-kit/sortable";
import type { AnimationEvent, ComponentProps } from "react";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import type { getListMembers } from "@/queries/lists";
import { ListMemberControls } from "@/components/lists/list-member-controls";
import {
  MediaCardTitle,
  MediaRowTitle,
  MediaViewCollection,
  MediaViewTile,
} from "@/components/media-tile";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { DragHandle, SortableMediaCollection } from "@/components/sortable-media-collection";
import type { MediaViewMode } from "@/components/ui/view-toggle";
import { cn } from "@/lib/utils";
import { useSortableItems } from "@/hooks/use-sortable-items";
import { itemDestination } from "@/lib/item-destination";

type ListMembersPage = NonNullable<Awaited<ReturnType<typeof getListMembers>>>;
type ListMember = ListMembersPage["items"][number];

const MEMBER_TYPE_LABELS = {
  item: "Item",
  collectionItem: "Collection Item",
  order: "Order",
} as const;

export function memberImages(member: ListMember): readonly string[] {
  if (member.type === "order") return member.images;
  return member.image ? [member.image] : [];
}

function memberDestination(
  member: ListMember,
): ComponentProps<typeof MediaViewTile>["destination"] {
  if (member.type === "order") {
    return { to: "/orders/$id", params: { id: member.targetId } };
  }
  return itemDestination(
    member.type === "item" ? member.targetId : member.itemId,
    member.itemExternalId,
  );
}

function SortableListMember({
  member,
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
  readonly viewMode: MediaViewMode;
  readonly entranceAnimationActive: boolean;
  readonly sortingDisabled: boolean;
  readonly removingMemberIds: readonly string[] | undefined;
  readonly selected: boolean;
  readonly dropIndicator?: "before" | "after";
  readonly onToggleSelection: () => void;
  readonly onRemove: (memberId: string) => Promise<void>;
  readonly onEntranceAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
}): React.JSX.Element {
  const removeDisabled = removingMemberIds !== undefined;
  const reorderDisabled = sortingDisabled || removeDisabled;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useSortable({
    id: member.id,
    disabled: reorderDisabled,
  });
  const isRemoving = removingMemberIds?.includes(member.id) ?? false;
  const destination = memberDestination(member);
  const typeLabel = (
    <span className="truncate text-xs leading-4 text-muted-foreground">
      {MEMBER_TYPE_LABELS[member.type]}
    </span>
  );

  return (
    <div ref={setNodeRef} className="relative">
      <MediaViewTile
        viewMode={viewMode}
        destination={destination}
        title={member.title}
        selected={selected}
        dropIndicator={dropIndicator}
        className={cn(entranceAnimationActive && "animate-data-in")}
        onAnimationEnd={onEntranceAnimationEnd}
        image={
          <ImageThumbnail
            images={memberImages(member)}
            title={member.title}
            fallbackIcon={
              <HugeiconsIcon icon={PackageIcon} className="size-8 text-muted-foreground/40" />
            }
            className="size-full"
            decorative
            loading="lazy"
          />
        }
        card={
          <>
            {typeLabel}
            <MediaCardTitle title={member.title} destination={destination} />
          </>
        }
        row={
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <MediaRowTitle title={member.title} destination={destination} />
            {typeLabel}
          </span>
        }
        controlsActive={selected || isDragging || isRemoving}
        controls={
          <ListMemberControls
            member={member}
            selected={selected}
            removeDisabled={removeDisabled}
            isRemoving={isRemoving}
            onToggleSelection={onToggleSelection}
            onRemove={onRemove}
          >
            <DragHandle
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              label={`Reorder ${member.title}`}
              disabled={reorderDisabled}
            />
          </ListMemberControls>
        }
      />
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
  readonly viewMode: MediaViewMode;
  readonly totalCount: number;
  readonly isSaving: boolean;
  readonly sortingDisabled: boolean;
  readonly removingMemberIds: readonly string[] | undefined;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => Promise<{ readonly isFetchNextPageError: boolean }>;
  readonly onRemove: (memberId: string) => Promise<void>;
  readonly onMove: (intent: PositionOrderInput) => Promise<void>;
  readonly selectedIds: ReadonlySet<string>;
  readonly onClearSelection: () => void;
  readonly onToggleSelection: (memberId: string, selected: boolean) => void;
}): React.JSX.Element {
  const sortable = useSortableItems({
    items: members,
    totalCount,
    selectedIds,
    selectedLabel: "selected",
    fallbackLabel: "selection",
    screenReaderInstruction:
      "To reorder, press Space. Use the arrow keys to choose a new position, then press Space to drop it. Press Escape to cancel.",
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    onMove,
    onClearSelection,
  });

  return (
    <SortableMediaCollection sortable={sortable} vertical={viewMode === "list"}>
      <MediaViewCollection
        viewMode={viewMode}
        className={cn(sortable.activeId && "pointer-events-none")}
        aria-busy={isSaving}
      >
        {members.map((member) => (
          <SortableListMember
            key={member.id}
            member={member}
            viewMode={viewMode}
            entranceAnimationActive={sortable.entranceAnimationActive}
            sortingDisabled={sortingDisabled || isSaving || members.length < 2}
            removingMemberIds={removingMemberIds}
            selected={selectedIds.has(member.id)}
            dropIndicator={sortable.dropPlacement(member.id)}
            onToggleSelection={() => onToggleSelection(member.id, !selectedIds.has(member.id))}
            onRemove={onRemove}
            onEntranceAnimationEnd={sortable.entranceAnimationEnd(member.id)}
          />
        ))}
      </MediaViewCollection>
    </SortableMediaCollection>
  );
}
