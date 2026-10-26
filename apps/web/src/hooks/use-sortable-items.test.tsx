import { afterAll, afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { ComponentProps } from "react";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { frame } from "../../test/kanban-drag";
import { ListMemberGrid } from "@/components/lists/list-member-grid";
import { useSortableItems } from "./use-sortable-items";

const media = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = false;
Object.defineProperty(media, "matches", { get: () => reducedMotion });
const matchMedia = spyOn(window, "matchMedia").mockImplementation(() => media);

afterAll(() => matchMedia.mockRestore());

afterEach(() => {
  cleanup();
  reducedMotion = false;
});

function renderSortable() {
  return renderHook(() =>
    useSortableItems({
      items: [
        { id: "first", title: "First" },
        { id: "second", title: "Second" },
      ],
      totalCount: 2,
      selectedIds: new Set<string>(),
      selectedLabel: "items",
      fallbackLabel: "item",
      screenReaderInstruction: "Press space to reorder.",
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: async () => ({ isFetchNextPageError: false }),
      onMove: async () => {},
      onClearSelection: () => {},
    }),
  );
}

test("reduced motion finishes sortable entrance without an animation end event", () => {
  reducedMotion = true;
  const { result } = renderSortable();
  expect(result.current.entranceAnimationActive).toBe(false);
});

test("enabling reduced motion during entrance finishes it permanently", () => {
  const { result } = renderSortable();
  expect(result.current.entranceAnimationActive).toBe(true);
  act(() => {
    reducedMotion = true;
    media.dispatchEvent(new Event("change"));
  });
  expect(result.current.entranceAnimationActive).toBe(false);
  act(() => {
    reducedMotion = false;
    media.dispatchEvent(new Event("change"));
  });
  expect(result.current.entranceAnimationActive).toBe(false);
});

test("normal motion keeps entrance until animation completion", () => {
  const { result } = renderSortable();
  expect(result.current.entranceAnimationActive).toBe(true);
  act(() => result.current.finishEntranceAnimation());
  expect(result.current.entranceAnimationActive).toBe(false);
});

const LONG_TITLE = "AnUnbrokenTitle".repeat(20);
const IDS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9"];
const MEMBERS = IDS.map((id, position) => ({
  id,
  position,
  type: "item" as const,
  targetId: `item-${id}`,
  title: id,
  image: null,
  itemExternalId: position + 1,
})) satisfies ComponentProps<typeof ListMemberGrid>["members"];
const COLUMNS = 5;
const GRID = { left: 236, top: 136 };
const TILE = { width: 195.203125, height: 160, gap: 12 };
const LABEL = { width: 36.90625, height: 32 };
const DRAG_TIMEOUT_MS = 20_000;
const REORDER = "Reorder ";

// A browser lays boxes out in 1/64 px units, so a centered label can sit a hair off center.
const snapToLayoutUnit = (value: number) => Math.round(value * 64) / 64;

function tileIndex(element: HTMLElement): number {
  const tile = element.closest(".group\\/item") ?? element.querySelector(":scope > .group\\/item");
  const handle = tile?.querySelector(`[aria-label^="${REORDER}"]`);
  const title = handle?.getAttribute("aria-label")?.slice(REORDER.length);
  return IDS.indexOf(title === LONG_TITLE ? "L1" : (title ?? ""));
}

// Lays the tiles out in a five-column grid with the column widths Chrome gives the Lists grid
// at 1440 px, and centers the overlay's label inside the overlay box as its flex classes do.
function stubGridLayout(): void {
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
    const index = tileIndex(this);
    if (index !== -1) {
      return DOMRect.fromRect({
        x: GRID.left + (index % COLUMNS) * (TILE.width + TILE.gap),
        y: GRID.top + Math.floor(index / COLUMNS) * (TILE.height + TILE.gap),
        width: TILE.width,
        height: TILE.height,
      });
    }
    // dnd-kit fixes the drag overlay box, and the grid puts nothing else inside a fixed element.
    const box = this.parentElement;
    if (box?.style.position === "fixed") {
      const labelWidth = this.textContent === LONG_TITLE ? TILE.width * 3 : LABEL.width;
      const [, x = "0", y = "0"] =
        /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(box.style.transform) ?? [];
      return DOMRect.fromRect({
        x: snapToLayoutUnit(
          Number.parseFloat(box.style.left) +
            Number(x) +
            (Number.parseFloat(box.style.width) - labelWidth) / 2,
        ),
        y: snapToLayoutUnit(
          Number.parseFloat(box.style.top) +
            Number(y) +
            (Number.parseFloat(box.style.height) - LABEL.height) / 2,
        ),
        width: labelWidth,
        height: LABEL.height,
      });
    }
    return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
  };
}

// List detail's grid, whose drag overlay is a small label like the Lists and Wishlist grids'.
async function renderGrid(
  onMove: (intent: PositionOrderInput) => Promise<void>,
  members = MEMBERS,
): Promise<void> {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <ListMemberGrid
        members={members}
        viewMode="grid"
        totalCount={MEMBERS.length}
        isSaving={false}
        sortingDisabled={false}
        removingMemberIds={undefined}
        hasNextPage={false}
        isFetchingNextPage={false}
        selectedIds={new Set()}
        onLoadMore={async () => ({ isFetchNextPageError: false })}
        onRemove={async () => {}}
        onMove={onMove}
        onClearSelection={() => {}}
        onToggleSelection={() => {}}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

async function moveWithKeyboard(
  id: string,
  arrow: string,
  members = MEMBERS,
): Promise<readonly unknown[]> {
  const onMove = mock(async (_intent: PositionOrderInput) => {});
  await renderGrid(onMove, members);
  const handle = screen.getByRole("button", {
    name: `${REORDER}${members.find((member) => member.id === id)?.title}`,
  });
  await act(async () => {
    handle.focus();
  });
  for (const code of ["Space", arrow, "Space"]) {
    fireEvent.keyDown(handle, { code, key: code === "Space" ? " " : code });
    await frame();
  }
  return onMove.mock.calls.map(([intent]) => intent);
}

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

test(
  "a label wider than two columns moves one slot left and right",
  async () => {
    const members = MEMBERS.map((member) => ({
      ...member,
      title: member.id === "L1" ? LONG_TITLE : member.title,
    }));
    expect(await moveWithKeyboard("L1", "ArrowLeft", members)).toEqual([
      { movedIds: ["L1"], anchorId: "L0", placement: "before" },
    ]);
    cleanup();
    expect(await moveWithKeyboard("L1", "ArrowRight", members)).toEqual([
      { movedIds: ["L1"], anchorId: "L2", placement: "after" },
    ]);
  },
  DRAG_TIMEOUT_MS,
);
