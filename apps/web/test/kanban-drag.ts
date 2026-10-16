import { act, fireEvent } from "@testing-library/react";

const COLUMN_X = 300;
const COLUMN_WIDTH = 200;

type Point = { readonly x: number; readonly y: number };

export function stubKanbanLayout(cardHeight: (id: string) => number): void {
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
}

export const frame = () =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 20);
      }),
  );

const pointer = { isPrimary: true, button: 0, pointerId: 1 };

// A test that times out keeps running its drag, so stop it before the next test renders.
let dragAbort = new AbortController();
let dragInFlight: Promise<unknown> = Promise.resolve();

export async function stopDrags(): Promise<void> {
  dragAbort.abort();
  await dragInFlight.catch(() => {});
  dragAbort = new AbortController();
}

function track<T>(step: Promise<T>): Promise<T> {
  dragInFlight = step;
  return step;
}

export function startDrag(handle: Element, from: Point, to: Point): Promise<() => Promise<void>> {
  return track(runDrag(handle, from, to, dragAbort.signal));
}

async function runDrag(
  handle: Element,
  from: Point,
  to: Point,
  signal: AbortSignal,
): Promise<() => Promise<void>> {
  fireEvent.pointerDown(handle, { ...pointer, clientX: from.x, clientY: from.y });
  await frame();
  const steps = 6;
  for (let step = 1; step <= steps; step++) {
    signal.throwIfAborted();
    fireEvent.pointerMove(document, {
      ...pointer,
      clientX: from.x + ((to.x - from.x) * step) / steps,
      clientY: from.y + ((to.y - from.y) * step) / steps,
    });
    await frame();
  }
  return () => track(release(to, signal));
}

async function release(at: Point, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  fireEvent.pointerUp(document, { ...pointer, clientX: at.x, clientY: at.y });
  await frame();
}

export async function drag(handle: Element, from: Point, to: Point): Promise<void> {
  const drop = await startDrag(handle, from, to);
  await drop();
}

export const cardsIn = (columnId: string) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      `[data-slot="kanban-column"][data-value="${columnId}"] [data-slot="kanban-item"]`,
    ),
  ].map((element) => element.dataset.value);
