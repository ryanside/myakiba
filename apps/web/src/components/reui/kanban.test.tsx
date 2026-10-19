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
import { cardsIn, drag, frame, stopDrags, stubKanbanLayout } from "../../../test/kanban-drag";

afterEach(async () => {
  await stopDrags();
  cleanup();
});

const DRAG_TIMEOUT_MS = 20_000;

beforeAll(() => stubKanbanLayout((id) => (id === "tall" ? 200 : 100)));

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

describe("dragging a card to another column", () => {
  test(
    "a tall card grabbed near its top lands where the pointer is",
    async () => {
      render(
        <Board initial={{ todo: [{ id: "tall" }], done: [{ id: "first" }, { id: "second" }] }} />,
      );

      await drag(screen.getByText("tall"), { x: 100, y: 10 }, { x: 400, y: 130 });

      expect({ todo: cardsIn("todo"), done: cardsIn("done") }).toEqual({
        todo: [],
        done: ["first", "tall", "second"],
      });
    },
    DRAG_TIMEOUT_MS,
  );

  test(
    "a tall card grabbed near its top follows the pointer, not its own center",
    async () => {
      render(
        <Board initial={{ todo: [{ id: "tall" }], done: [{ id: "first" }, { id: "second" }] }} />,
      );

      await drag(screen.getByText("tall"), { x: 100, y: 10 }, { x: 400, y: 220 });

      expect({ todo: cardsIn("todo"), done: cardsIn("done") }).toEqual({
        todo: [],
        done: ["first", "tall", "second"],
      });
    },
    DRAG_TIMEOUT_MS,
  );
});

describe("holding a card over the gap between two columns", () => {
  test(
    "the card stays in its own column",
    async () => {
      render(
        <Board
          initial={{
            todo: [{ id: "first" }, { id: "second" }],
            done: [{ id: "moving" }, { id: "third" }, { id: "fourth" }],
          }}
        />,
      );

      await drag(screen.getByText("moving"), { x: 400, y: 10 }, { x: 250, y: 30 });

      expect({ todo: cardsIn("todo"), done: cardsIn("done") }).toEqual({
        todo: ["first", "second"],
        done: ["moving", "third", "fourth"],
      });
    },
    DRAG_TIMEOUT_MS,
  );
});

describe("dragging a card with the keyboard", () => {
  test(
    "Space, ArrowRight, Space moves the focused card to the next column",
    async () => {
      render(<Board initial={{ todo: [{ id: "moving" }], done: [{ id: "first" }] }} />);
      const card = screen.getByRole("button", { name: "moving" });

      await act(async () => {
        card.focus();
      });
      for (const code of ["Space", "ArrowRight", "Space"]) {
        fireEvent.keyDown(card, { code, key: code });
        await frame();
      }

      expect({ todo: cardsIn("todo"), done: cardsIn("done") }).toEqual({
        todo: [],
        done: ["moving", "first"],
      });
    },
    DRAG_TIMEOUT_MS,
  );
});
