import type { FocusEvent, KeyboardEvent } from "react";

const EDITABLE_CELLS = '[data-col="price"], [data-col="count"], [data-col="condition"]';

const isVisible = (element: HTMLElement) => element.checkVisibility();

function focusablesIn(root: Element): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>("a[href], button, input, [role='checkbox']"),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true" &&
      isVisible(element),
  );
}

function focusCell(element: HTMLElement | undefined) {
  if (!element) return;
  element.focus();
  if (element instanceof HTMLInputElement) element.select();
}

function isTextEntry(element: HTMLElement): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type !== "checkbox";
}

/** Left and Right belong to the caret until it reaches the end of the text. */
function caretAtEdge(input: HTMLInputElement, key: "ArrowLeft" | "ArrowRight"): boolean {
  const { selectionStart, selectionEnd, value } = input;
  // A number input has no selection API, and its values are short.
  if (selectionStart === null || selectionEnd === null) return true;
  if (selectionStart !== selectionEnd) return true;
  return key === "ArrowLeft" ? selectionStart === 0 : selectionEnd === value.length;
}

function nextDataCell(from: HTMLElement): HTMLElement | undefined {
  const row = from.closest("tr");
  const cell = from.closest(EDITABLE_CELLS);
  if (!row || !cell) return undefined;
  const inRow = [...row.querySelectorAll<HTMLElement>(EDITABLE_CELLS)];
  const later = inRow.slice(inRow.indexOf(cell as HTMLElement) + 1);
  for (const candidate of later) {
    const [first] = focusablesIn(candidate);
    if (first) return first;
  }
  const rows = [...(row.parentElement?.querySelectorAll("tr[data-row]") ?? [])];
  for (const candidate of rows.slice(rows.indexOf(row) + 1)) {
    for (const nextCell of candidate.querySelectorAll<HTMLElement>(EDITABLE_CELLS)) {
      const [first] = focusablesIn(nextCell);
      if (first) return first;
    }
  }
  return undefined;
}

/**
 * Spreadsheet keys over a real table. Left and Right walk the row's controls, Up and Down keep the
 * column, Enter moves on from an input or a closed select. Keys pressed in a portaled popup bubble
 * here through React but are not inside the table, so they stay the popup's.
 */
export function onTableKeys(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const grid = event.currentTarget;
  const target = event.target as HTMLElement;
  if (!grid.contains(target)) return;
  const row = target.closest<HTMLElement>("tr[data-row]");
  if (!row) return;

  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  switch (event.key) {
    case "ArrowLeft":
    case "ArrowRight": {
      if (isTextEntry(target) && !caretAtEdge(target, event.key)) return;
      stop();
      const inRow = focusablesIn(row);
      const step = event.key === "ArrowLeft" ? -1 : 1;
      focusCell(inRow[inRow.indexOf(target) + step]);
      return;
    }
    case "ArrowUp":
    case "ArrowDown": {
      stop();
      const column = target.closest<HTMLElement>("[data-col]")?.dataset.col;
      if (column === undefined) return;
      const rows = [...grid.querySelectorAll<HTMLElement>("tr[data-row]")];
      const step = event.key === "ArrowUp" ? -1 : 1;
      for (let index = rows.indexOf(row) + step; rows[index]; index += step) {
        const cell = rows[index]?.querySelector(`[data-col="${column}"]`);
        const [first] = cell ? focusablesIn(cell) : [];
        if (first) {
          focusCell(first);
          return;
        }
      }
      return;
    }
    case "Enter": {
      const moves =
        isTextEntry(target) ||
        (target.getAttribute("role") === "combobox" &&
          target.getAttribute("aria-expanded") !== "true");
      if (!moves || !target.closest(EDITABLE_CELLS)) return;
      stop();
      focusCell(nextDataCell(target));
    }
  }
}

/** Focus alone scrolls only a fully hidden element, which can leave a sliver of a control in view. */
export function revealFocus({ currentTarget, target }: FocusEvent<HTMLElement>) {
  if (currentTarget.contains(target) && target.matches(":focus-visible")) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
