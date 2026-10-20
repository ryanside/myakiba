import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Toaster, toast } from "@/components/ui/toast";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "./kanban";
import { startDrag, stopDrags, stubKanbanLayout } from "../../../test/kanban-drag";

afterEach(async () => {
  await stopDrags();
  act(() => toast.close());
  cleanup();
});

beforeAll(() => stubKanbanLayout(() => 100));

// Dialog, sheet, popover, select and tooltip popups all use z-50.
const DIALOG_LAYER = 50;

function Board() {
  const [columns, setColumns] = useState<Record<string, string[]>>({ todo: ["card"], done: [] });
  return (
    <Kanban value={columns} onValueChange={setColumns} getItemValue={(card) => card}>
      <KanbanBoard>
        {Object.entries(columns).map(([columnId, cards]) => (
          <KanbanColumn key={columnId} value={columnId}>
            <KanbanColumnContent value={columnId}>
              {cards.map((card) => (
                <KanbanItem key={card} value={card}>
                  <KanbanItemHandle>{card}</KanbanItemHandle>
                </KanbanItem>
              ))}
            </KanbanColumnContent>
          </KanbanColumn>
        ))}
      </KanbanBoard>
      <KanbanOverlay>{({ value }) => <span>dragging {value}</span>}</KanbanOverlay>
    </Kanban>
  );
}

// happy-dom loads no stylesheet, so a Tailwind z-* class stands in where no inline z-index is set.
function zIndexOf(node: Element): number {
  const inline = Number.parseInt(getComputedStyle(node).zIndex, 10);
  if (!Number.isNaN(inline)) return inline;
  const utility = /(?:^|\s)z-\[?(\d+)\]?(?=\s|$)/.exec(node.getAttribute("class") ?? "");
  return utility ? Number(utility[1]) : Number.NaN;
}

// The z-index of the outermost ancestor that sets one, which orders it in the root stacking context.
function rootStackLevel(element: Element): number {
  let level = Number.NaN;
  let node: Element | null = element;
  while (node && node !== document.body) {
    const zIndex = zIndexOf(node);
    if (!Number.isNaN(zIndex)) level = zIndex;
    node = node.parentElement;
  }
  return level;
}

describe("a toast raised during a kanban drag", () => {
  test("stacks above the dragged card", async () => {
    render(
      <Toaster>
        <Board />
      </Toaster>,
    );

    const drop = await startDrag(screen.getByText("card"), { x: 100, y: 10 }, { x: 400, y: 10 });
    act(() => {
      toast.add({ title: "Failed to update order status", type: "error" });
    });
    const toastTitle = await screen.findByText("Failed to update order status");
    const draggedCard = screen.getByText("dragging card");

    expect(rootStackLevel(toastTitle)).toBeGreaterThan(rootStackLevel(draggedCard));
    await drop();
  });
});

test("the dragged card stays above dialogs, sheets and popovers", async () => {
  render(<Board />);

  const drop = await startDrag(screen.getByText("card"), { x: 100, y: 10 }, { x: 400, y: 10 });

  expect(rootStackLevel(screen.getByText("dragging card"))).toBeGreaterThan(DIALOG_LAYER);
  await drop();
});
