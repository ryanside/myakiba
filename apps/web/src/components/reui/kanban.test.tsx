import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
} from "./kanban";

afterEach(cleanup);

const COLUMN_X = 300;
const COLUMN_WIDTH = 200;
const cardHeight = (id: string) => (id === "tall" ? 200 : 100);

beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
    const column = this.closest<HTMLElement>('[data-slot="kanban-column"]');
    const columns = [...document.querySelectorAll('[data-slot="kanban-column"]')];
    const left = column ? columns.indexOf(column) * COLUMN_X : 0;
    let top = 0;
    let height = column ? 1000 : 0;
    if (this.dataset.slot === "kanban-item" && this.dataset.value) {
      const siblings = [...(this.parentElement?.children ?? [])] as HTMLElement[];
      for (const sibling of siblings) {
        if (sibling === this) break;
        top += cardHeight(sibling.dataset.value ?? "");
      }
      height = cardHeight(this.dataset.value);
    }
    return DOMRect.fromRect({ x: left, y: top, width: column ? COLUMN_WIDTH : 0, height });
  };
});

type Card = { id: string };

function Board({ initial }: { initial: Record<string, Card[]> }) {
  const [columns, setColumns] = useState(initial);
  return (
    <Kanban value={columns} onValueChange={setColumns} getItemValue={(card) => card.id}>
      <KanbanBoard>
        {Object.entries(columns).map(([columnId, cards]) => (
          <KanbanColumn key={columnId} value={columnId} aria-label={columnId}>
            <KanbanColumnContent value={columnId}>
              {cards.map((card) => (
                <KanbanItem key={card.id} value={card.id}>
                  <KanbanItemHandle>{card.id}</KanbanItemHandle>
                </KanbanItem>
              ))}
            </KanbanColumnContent>
          </KanbanColumn>
        ))}
      </KanbanBoard>
    </Kanban>
  );
}

const frame = () =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 20);
      }),
  );
const pointer = { isPrimary: true, button: 0, pointerId: 1 };

async function drag(card: string, from: { x: number; y: number }, to: { x: number; y: number }) {
  fireEvent.pointerDown(screen.getByText(card), { ...pointer, clientX: from.x, clientY: from.y });
  await frame();
  const steps = 6;
  for (let step = 1; step <= steps; step++) {
    fireEvent.pointerMove(document, {
      ...pointer,
      clientX: from.x + ((to.x - from.x) * step) / steps,
      clientY: from.y + ((to.y - from.y) * step) / steps,
    });
    await frame();
  }
  fireEvent.pointerUp(document, { ...pointer, clientX: to.x, clientY: to.y });
  await frame();
}

const cardsIn = (columnId: string) =>
  [
    ...document.querySelectorAll(
      `[data-slot="kanban-column"][data-value="${columnId}"] [data-slot="kanban-item"]`,
    ),
  ].map((element) => element.textContent);

describe("dragging a card to another column", () => {
  test("a tall card grabbed near its top lands where the pointer is", async () => {
    render(
      <Board initial={{ todo: [{ id: "tall" }], done: [{ id: "first" }, { id: "second" }] }} />,
    );

    await drag("tall", { x: 100, y: 10 }, { x: 400, y: 130 });

    expect({ todo: cardsIn("todo"), done: cardsIn("done") }).toEqual({
      todo: [],
      done: ["first", "tall", "second"],
    });
  });

  test("a tall card grabbed near its top follows the pointer, not its own center", async () => {
    render(
      <Board initial={{ todo: [{ id: "tall" }], done: [{ id: "first" }, { id: "second" }] }} />,
    );

    await drag("tall", { x: 100, y: 10 }, { x: 400, y: 220 });

    expect({ todo: cardsIn("todo"), done: cardsIn("done") }).toEqual({
      todo: [],
      done: ["first", "tall", "second"],
    });
  });
});
