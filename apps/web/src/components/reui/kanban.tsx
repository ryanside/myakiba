import * as React from "react";
import * as z from "zod";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DraggableAttributes,
  DraggableSyntheticListeners,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  DropAnimation,
  Modifiers,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { AnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";

import { getCrossColumnInsertionIndex, getDragPositionY } from "@/components/reui/kanban-placement";
import { cn } from "@/lib/utils";

interface KanbanContextProps<T> {
  columns: Record<string, T[]>;
  getItemId: (item: T) => string;
  columnIds: string[];
  activeId: UniqueIdentifier | null;
  setActiveId: (id: UniqueIdentifier | null) => void;
  findContainer: (id: UniqueIdentifier) => string | undefined;
  isColumn: (id: UniqueIdentifier) => boolean;
  modifiers?: Modifiers;
}

// oxlint-disable-next-line typescript/no-explicit-any
const KanbanContext = createContext<KanbanContextProps<any>>({
  columns: {},
  getItemId: () => "",
  columnIds: [],
  activeId: null,
  setActiveId: () => {},
  // oxlint-disable-next-line no-useless-undefined
  findContainer: () => undefined,
  isColumn: () => false,
  modifiers: undefined,
});

const ColumnContext = createContext<{
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners | undefined;
  isDragging?: boolean;
  disabled?: boolean;
}>({
  attributes: {} as DraggableAttributes,
  listeners: undefined,
  isDragging: false,
  disabled: false,
});

const ItemContext = createContext<{
  listeners: DraggableSyntheticListeners | undefined;
  isDragging?: boolean;
  disabled?: boolean;
}>({
  listeners: undefined,
  isDragging: false,
  disabled: false,
});

const IsOverlayContext = createContext(false);

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.4",
      },
    },
  }),
};

function getDragY(event: DragMoveEvent): number | null {
  const activationCoordinates = getEventCoordinates(event.activatorEvent);
  const activeRect = event.active.rect.current.translated;
  return getDragPositionY({
    activationY: activationCoordinates?.y ?? null,
    deltaY: event.delta.y,
    activeTop: activeRect?.top ?? null,
    activeHeight: activeRect?.height ?? 0,
  });
}

export interface KanbanMoveEvent<TColumnId extends string = string> {
  event: DragEndEvent;
  activeContainer: TColumnId;
  activeIndex: number;
  overContainer: TColumnId;
  overIndex: number;
}

export interface KanbanRootProps<T, TColumnId extends string = string> extends Omit<
  useRender.ComponentProps<"div">,
  "children"
> {
  value: Record<TColumnId, T[]>;
  onValueChange: (value: Record<TColumnId, T[]>) => void;
  getItemValue: (item: T) => string;
  children: ReactNode;
  onMove?: (event: KanbanMoveEvent<TColumnId>) => void;
  modifiers?: Modifiers;
}

function Kanban<T, TColumnId extends string = string>({
  value,
  onValueChange,
  getItemValue,
  children,
  className,
  render,
  onMove,
  modifiers,
  ...props
}: KanbanRootProps<T, TColumnId>) {
  const columns = value;
  const setColumns = onValueChange;
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const originalContainerRef = useRef<TColumnId | null>(null);
  const originalIndexRef = useRef<number | null>(null);
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainerRef = useRef(false);
  const previousColumnsRef = useRef(columns);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columnIds = useMemo(() => Object.keys(columns) as TColumnId[], [columns]);

  const isColumn = useCallback(
    (id: UniqueIdentifier): id is TColumnId => columnIds.some((columnId) => columnId === id),
    [columnIds],
  );

  const findContainer = useCallback(
    (id: UniqueIdentifier) => {
      if (isColumn(id)) return id;
      return columnIds.find((key) => columns[key].some((item) => getItemValue(item) === id));
    },
    [columns, columnIds, getItemValue, isColumn],
  );

  const collisionDetectionStrategy = useCallback<CollisionDetection>(
    (args) => {
      if (activeId !== null && isColumn(activeId)) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            isColumn(container.id),
          ),
        });
      }

      const pointerIntersections = pointerWithin(args);
      const intersections =
        pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId !== null) {
        if (isColumn(overId)) {
          const itemIds = new Set(columns[overId].map(getItemValue));
          if (itemIds.size > 0) {
            overId =
              getFirstCollision(
                closestCenter({
                  ...args,
                  droppableContainers: args.droppableContainers.filter((container) =>
                    itemIds.has(String(container.id)),
                  ),
                }),
                "id",
              ) ?? overId;
          }
        }

        lastOverIdRef.current = overId;
        return [{ id: overId }];
      }

      if (recentlyMovedToNewContainerRef.current) {
        lastOverIdRef.current = activeId;
      }

      return lastOverIdRef.current === null ? [] : [{ id: lastOverIdRef.current }];
    },
    [activeId, columns, getItemValue, isColumn],
  );

  useEffect(() => {
    if (previousColumnsRef.current === columns) return;
    previousColumnsRef.current = columns;

    const frame = requestAnimationFrame(() => {
      recentlyMovedToNewContainerRef.current = false;
    });

    return () => cancelAnimationFrame(frame);
  }, [columns]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id);
      lastOverIdRef.current = null;
      recentlyMovedToNewContainerRef.current = false;
      if (isColumn(event.active.id)) {
        originalContainerRef.current = null;
        originalIndexRef.current = null;
      } else {
        const container = findContainer(event.active.id) ?? null;
        originalContainerRef.current = container;
        originalIndexRef.current = container
          ? columns[container].findIndex((item) => getItemValue(item) === event.active.id)
          : null;
      }
    },
    [columns, findContainer, getItemValue, isColumn],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      if (isColumn(active.id)) return;

      const activeContainer = findContainer(active.id);
      const overContainer = findContainer(over.id);

      if (!activeContainer || !overContainer) {
        return;
      }

      if (activeContainer !== overContainer) {
        const activeItems = columns[activeContainer];
        const overItems = columns[overContainer];

        const activeIndex = activeItems.findIndex((item: T) => getItemValue(item) === active.id);
        if (activeIndex === -1) return;

        const overIndex = getCrossColumnInsertionIndex({
          dragY: getDragY(event),
          overTop: over.rect.top,
          overHeight: over.rect.height,
          overIndex: overItems.findIndex((item: T) => getItemValue(item) === over.id),
          overItemCount: overItems.length,
          isOverColumn: isColumn(over.id),
        });

        const newActiveItems = [...activeItems];
        const newOverItems = [...overItems];
        const [movedItem] = newActiveItems.splice(activeIndex, 1);
        newOverItems.splice(overIndex, 0, movedItem);

        recentlyMovedToNewContainerRef.current = true;
        setColumns({
          ...columns,
          [activeContainer]: newActiveItems,
          [overContainer]: newOverItems,
        });
      }
    },
    [findContainer, getItemValue, isColumn, setColumns, columns],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    originalContainerRef.current = null;
    originalIndexRef.current = null;
    lastOverIdRef.current = null;
    recentlyMovedToNewContainerRef.current = false;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const startContainer = originalContainerRef.current;
      const startIndex = originalIndexRef.current;
      const currentContainer = isColumn(active.id) ? undefined : findContainer(active.id);
      let currentIndex =
        currentContainer === undefined
          ? -1
          : columns[currentContainer].findIndex((item: T) => getItemValue(item) === active.id);

      if (over && currentContainer) {
        const overContainer = findContainer(over.id);
        const overIndex = columns[currentContainer].findIndex(
          (item: T) => getItemValue(item) === over.id,
        );

        if (overContainer === currentContainer && overIndex !== -1 && currentIndex !== overIndex) {
          setColumns({
            ...columns,
            [currentContainer]: arrayMove(columns[currentContainer], currentIndex, overIndex),
          });
          currentIndex = overIndex;
        }
      }

      setActiveId(null);
      originalContainerRef.current = null;
      originalIndexRef.current = null;
      lastOverIdRef.current = null;
      recentlyMovedToNewContainerRef.current = false;

      if (!over) return;

      if (onMove && !isColumn(active.id)) {
        if (startContainer && currentContainer) {
          onMove({
            event,
            activeContainer: startContainer,
            activeIndex: startIndex ?? currentIndex,
            overContainer: currentContainer,
            overIndex: currentIndex,
          });
        }
        return;
      }

      // Handle column reordering
      if (isColumn(active.id) && isColumn(over.id)) {
        const activeIndex = columnIds.indexOf(active.id);
        const overIndex = columnIds.indexOf(over.id);
        if (activeIndex !== overIndex) {
          const newOrder = arrayMove(columnIds, activeIndex, overIndex);
          const newColumns = Object.fromEntries(
            newOrder.map((key) => [key, columns[key]]),
          ) as Record<TColumnId, T[]>;
          setColumns(newColumns);
        }
      }
    },
    [columnIds, columns, findContainer, getItemValue, isColumn, setColumns, onMove],
  );

  const contextValue = useMemo(
    () => ({
      columns,
      getItemId: getItemValue,
      columnIds,
      activeId,
      setActiveId,
      findContainer,
      isColumn,
      modifiers,
    }),
    [columns, getItemValue, columnIds, activeId, findContainer, isColumn, modifiers],
  );

  const defaultProps = {
    "data-slot": "kanban",
    "data-dragging": activeId !== null,
    className: cn(activeId !== null && "cursor-grabbing!", className),
    children,
  };

  return (
    <KanbanContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        modifiers={modifiers}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {useRender({
          defaultTagName: "div",
          render,
          props: mergeProps<"div">(defaultProps, props),
        })}
      </DndContext>
    </KanbanContext.Provider>
  );
}

export type KanbanBoardProps = useRender.ComponentProps<"div">;

function KanbanBoard({ className, render, ...props }: KanbanBoardProps) {
  const { columnIds } = useContext(KanbanContext);

  const defaultProps = {
    "data-slot": "kanban-board",
    className: cn("grid auto-rows-fr gap-4 sm:grid-cols-3", className),
    children: props.children,
  };

  return (
    <SortableContext items={columnIds} strategy={rectSortingStrategy}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </SortableContext>
  );
}

export interface KanbanColumnProps extends useRender.ComponentProps<"div"> {
  value: string;
  disabled?: boolean;
}

function KanbanColumn(props: KanbanColumnProps) {
  const isOverlay = useContext(IsOverlayContext);

  return isOverlay ? <KanbanOverlayColumn {...props} /> : <KanbanSortableColumn {...props} />;
}

function KanbanOverlayColumn({ value, className, render, ...props }: KanbanColumnProps) {
  const contextValue = useMemo(
    () => ({
      attributes: {} as DraggableAttributes,
      listeners: undefined,
      isDragging: true,
      disabled: false,
    }),
    [],
  );
  const defaultProps = {
    "data-slot": "kanban-column",
    "data-value": value,
    "data-dragging": true,
    className: cn("group/kanban-column flex flex-col", className),
    children: props.children,
  };

  return (
    <ColumnContext.Provider value={contextValue}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </ColumnContext.Provider>
  );
}

function KanbanSortableColumn({ value, className, render, disabled, ...props }: KanbanColumnProps) {
  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging: isSortableDragging,
  } = useSortable({
    id: value,
    disabled,
    animateLayoutChanges,
  });

  const { activeId, isColumn } = useContext(KanbanContext);
  const isColumnDragging = activeId ? isColumn(activeId) : false;
  const contextValue = useMemo(
    () => ({ attributes, listeners, isDragging: isColumnDragging, disabled }),
    [attributes, disabled, isColumnDragging, listeners],
  );

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  } as CSSProperties;

  const defaultProps = {
    "data-slot": "kanban-column",
    "data-value": value,
    "data-dragging": isSortableDragging,
    "data-disabled": disabled,
    ref: setNodeRef,
    style,
    className: cn(
      "group/kanban-column flex flex-col",
      isSortableDragging && "opacity-50 z-50",
      disabled && "opacity-50",
      className,
    ),
    children: props.children,
  };

  return (
    <ColumnContext.Provider value={contextValue}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </ColumnContext.Provider>
  );
}

export interface KanbanColumnHandleProps extends useRender.ComponentProps<"div"> {
  cursor?: boolean;
}

function KanbanColumnHandle({
  className,
  render,
  cursor = true,
  ...props
}: KanbanColumnHandleProps) {
  const { attributes, listeners, isDragging, disabled } = useContext(ColumnContext);

  const defaultProps = {
    "data-slot": "kanban-column-handle",
    "data-dragging": isDragging,
    "data-disabled": disabled,
    ...attributes,
    ...listeners,
    className: cn(
      "opacity-0 transition-opacity group-hover/kanban-column:opacity-100",
      cursor && (isDragging ? "cursor-grabbing!" : "cursor-grab!"),
      className,
    ),
    children: props.children,
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export interface KanbanItemProps extends useRender.ComponentProps<"div"> {
  value: string;
  disabled?: boolean;
}

function KanbanItem(props: KanbanItemProps) {
  const isOverlay = useContext(IsOverlayContext);

  return isOverlay ? <KanbanOverlayItem {...props} /> : <KanbanSortableItem {...props} />;
}

function KanbanOverlayItem({ value, className, render, ...props }: KanbanItemProps) {
  const contextValue = useMemo(
    () => ({ listeners: undefined, isDragging: true, disabled: false }),
    [],
  );
  const defaultProps = {
    "data-slot": "kanban-item",
    "data-value": value,
    "data-dragging": true,
    className: cn(className),
    children: props.children,
  };

  return (
    <ItemContext.Provider value={contextValue}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </ItemContext.Provider>
  );
}

function KanbanSortableItem({ value, className, render, disabled, ...props }: KanbanItemProps) {
  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging: isSortableDragging,
  } = useSortable({
    id: value,
    disabled,
    animateLayoutChanges,
  });

  const { activeId, isColumn } = useContext(KanbanContext);
  const isItemDragging = activeId ? !isColumn(activeId) : false;
  const contextValue = useMemo(
    () => ({ listeners, isDragging: isItemDragging, disabled }),
    [disabled, isItemDragging, listeners],
  );

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  } as CSSProperties;

  const defaultProps = {
    "data-slot": "kanban-item",
    "data-value": value,
    "data-dragging": isSortableDragging,
    "data-disabled": disabled,
    ref: setNodeRef,
    style,
    ...attributes,
    className: cn(isSortableDragging && "opacity-50 z-50", disabled && "opacity-50", className),
    children: props.children,
  };

  return (
    <ItemContext.Provider value={contextValue}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </ItemContext.Provider>
  );
}

export interface KanbanItemHandleProps extends useRender.ComponentProps<"div"> {
  cursor?: boolean;
}

function KanbanItemHandle({ className, render, cursor = true, ...props }: KanbanItemHandleProps) {
  const { listeners, isDragging, disabled } = useContext(ItemContext);

  const defaultProps = {
    "data-slot": "kanban-item-handle",
    "data-dragging": isDragging,
    "data-disabled": disabled,
    ...listeners,
    className: cn(cursor && (isDragging ? "cursor-grabbing!" : "cursor-grab!"), className),
    children: props.children,
  };

  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

export interface KanbanColumnContentProps extends useRender.ComponentProps<"div"> {
  value: string;
}

function KanbanColumnContent({ value, className, render, ...props }: KanbanColumnContentProps) {
  const { columns, getItemId } = useContext(KanbanContext);

  const itemIds = useMemo(() => columns[value].map(getItemId), [columns, getItemId, value]);

  const defaultProps = {
    "data-slot": "kanban-column-content",
    className: cn("flex flex-col gap-2", className),
    children: props.children,
  };

  return (
    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
      {useRender({
        defaultTagName: "div",
        render,
        props: mergeProps<"div">(defaultProps, props),
      })}
    </SortableContext>
  );
}

export interface KanbanOverlayProps extends Omit<
  React.ComponentProps<typeof DragOverlay>,
  "children"
> {
  children?:
    | ReactNode
    | ((params: { value: UniqueIdentifier; variant: "column" | "item" }) => ReactNode);
}

const overlayRendererSchema = z.function({
  input: [
    z.object({
      value: z.custom<UniqueIdentifier>(),
      variant: z.enum(["column", "item"]),
    }),
  ],
  output: z.custom<ReactNode>(),
});

function KanbanOverlay({ children, className, ...props }: KanbanOverlayProps) {
  const { activeId, isColumn, modifiers } = useContext(KanbanContext);
  const portalTarget = globalThis.document?.body;

  const getVariant = (): "column" | "item" => {
    if (!activeId) return "item";
    return isColumn(activeId) ? "column" : "item";
  };
  const variant = getVariant();

  const getContent = () => {
    if (!(activeId && children)) return null;
    const renderer = overlayRendererSchema.safeParse(children);
    return renderer.success ? renderer.data({ value: activeId, variant }) : (children as ReactNode);
  };
  const content = getContent();

  if (!portalTarget) return null;

  return createPortal(
    <DragOverlay
      dropAnimation={dropAnimationConfig}
      modifiers={modifiers}
      className={cn("z-50", activeId && "cursor-grabbing", className)}
      {...props}
    >
      <IsOverlayContext.Provider value={true}>{content}</IsOverlayContext.Provider>
    </DragOverlay>,
    portalTarget,
  );
}

export {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnHandle,
  KanbanItem,
  KanbanItemHandle,
  KanbanColumnContent,
  KanbanOverlay,
};
