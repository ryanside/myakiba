import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { closestCenter, DndContext, DragOverlay } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { frame } from "../../test/kanban-drag";
import { useSortableItems } from "./use-sortable-items";

const IDS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9"];
const ITEMS = IDS.map((id) => ({ id, title: id }));
const NO_SELECTION: ReadonlySet<string> = new Set();
const COLUMNS = 5;
const GRID = { left: 236, top: 136 };
const TILE = { width: 195.203125, height: 160, gap: 12 };
const LABEL = { width: 36.90625, height: 32 };
const DRAG_TIMEOUT_MS = 20_000;

// A browser lays boxes out in 1/64 px units, so a centered label can sit a hair off center.
const snapToLayoutUnit = (value: number) => Math.round(value * 64) / 64;

// Lays the tiles out in a five-column grid with the column widths Chrome gives the Lists grid
// at 1440 px, and centers the overlay's label inside the overlay box as its flex classes do.
function stubGridLayout(): void {
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
    const tile = this.closest<HTMLElement>("[data-tile]");
    if (tile) {
      const index = IDS.indexOf(tile.dataset.tile ?? "");
      return DOMRect.fromRect({
        x: GRID.left + (index % COLUMNS) * (TILE.width + TILE.gap),
        y: GRID.top + Math.floor(index / COLUMNS) * (TILE.height + TILE.gap),
        width: TILE.width,
        height: TILE.height,
      });
    }
    const box = this.parentElement;
    if (this.dataset.overlayLabel !== undefined && box) {
      const [, x = "0", y = "0"] =
        /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(box.style.transform) ?? [];
      return DOMRect.fromRect({
        x: snapToLayoutUnit(
          Number.parseFloat(box.style.left) +
            Number(x) +
            (Number.parseFloat(box.style.width) - LABEL.width) / 2,
        ),
        y: snapToLayoutUnit(
          Number.parseFloat(box.style.top) +
            Number(y) +
            (Number.parseFloat(box.style.height) - LABEL.height) / 2,
        ),
        width: LABEL.width,
        height: LABEL.height,
      });
    }
    return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
  };
}

function Tile({ id }: { readonly id: string }): React.JSX.Element {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef } = useSortable({ id });
  return (
    <div ref={setNodeRef} data-tile={id}>
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}>
        {`Reorder ${id}`}
      </button>
    </div>
  );
}

// Mirrors the grid view of Lists, List detail and Wishlist: the overlay is a small label.
function Grid({
  onMove,
}: {
  readonly onMove: (intent: PositionOrderInput) => Promise<void>;
}): React.JSX.Element {
  const {
    itemIds,
    activeId,
    overlayLabel,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useSortableItems({
    items: ITEMS,
    totalCount: ITEMS.length,
    selectedIds: NO_SELECTION,
    selectedLabel: "selected Lists",
    fallbackLabel: "List",
    screenReaderInstruction: "Press Space to move a List.",
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: async () => ({ isFetchNextPageError: false }),
    onMove,
    onClearSelection: () => {},
  });
  return (
    <DndContext
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
        {itemIds.map((id) => (
          <Tile key={id} id={id} />
        ))}
      </SortableContext>
      <DragOverlay
        className="pointer-events-none flex items-center justify-center"
        dropAnimation={null}
        modifiers={[snapCenterToCursor]}
        zIndex={50}
      >
        {activeId ? <div data-overlay-label="">{overlayLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

async function moveWithKeyboard(id: string, arrow: string): Promise<readonly unknown[]> {
  const onMove = mock(async (_intent: PositionOrderInput) => {});
  render(<Grid onMove={onMove} />);
  const handle = screen.getByRole("button", { name: `Reorder ${id}` });
  await act(async () => {
    handle.focus();
  });
  for (const code of ["Space", arrow, "Space"]) {
    fireEvent.keyDown(handle, { code, key: code === "Space" ? " " : code });
    await frame();
  }
  return onMove.mock.calls.map(([intent]) => intent);
}

afterEach(cleanup);

beforeAll(stubGridLayout);

describe("moving a grid tile with the keyboard", () => {
  test(
    "ArrowLeft moves the second tile one slot left",
    async () => {
      expect(await moveWithKeyboard("L1", "ArrowLeft")).toEqual([
        { movedIds: ["L1"], anchorId: "L0", placement: "before" },
      ]);
    },
    DRAG_TIMEOUT_MS,
  );

  test(
    "ArrowRight moves the second tile one slot right",
    async () => {
      expect(await moveWithKeyboard("L1", "ArrowRight")).toEqual([
        { movedIds: ["L1"], anchorId: "L2", placement: "after" },
      ]);
    },
    DRAG_TIMEOUT_MS,
  );

  test(
    "ArrowDown moves the second tile one row down",
    async () => {
      expect(await moveWithKeyboard("L1", "ArrowDown")).toEqual([
        { movedIds: ["L1"], anchorId: "L6", placement: "after" },
      ]);
    },
    DRAG_TIMEOUT_MS,
  );

  test(
    "ArrowUp moves a second-row tile one row up",
    async () => {
      expect(await moveWithKeyboard("L6", "ArrowUp")).toEqual([
        { movedIds: ["L6"], anchorId: "L1", placement: "before" },
      ]);
    },
    DRAG_TIMEOUT_MS,
  );
});
