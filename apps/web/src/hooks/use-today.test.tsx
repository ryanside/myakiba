import { afterEach, expect, setSystemTime, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { useToday } from "./use-today";

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realTimeZone = process.env.TZ;
type HeldTimer = { readonly due: number; readonly callback: () => void };
let midnightTimers: HeldTimer[] = [];

function holdLongTimers() {
  globalThis.setTimeout = ((callback: () => void, delay = 0, ...args: unknown[]) => {
    if (delay < 60_000) return realSetTimeout(callback, delay, ...args);
    const timer: HeldTimer = { due: Date.now() + delay, callback };
    midnightTimers.push(timer);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer: HeldTimer | ReturnType<typeof setTimeout> | undefined) => {
    midnightTimers = midnightTimers.filter((entry) => entry !== timer);
    if (timer && !("due" in timer)) realClearTimeout(timer);
  }) as typeof clearTimeout;
}

function advanceTo(iso: string) {
  act(() => {
    setSystemTime(new Date(iso));
    const due = midnightTimers.filter((timer) => timer.due <= Date.now());
    midnightTimers = midnightTimers.filter((timer) => timer.due > Date.now());
    for (const timer of due) timer.callback();
  });
}

function Today() {
  return <p aria-label="today">{useToday()}</p>;
}

afterEach(() => {
  cleanup();
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  if (realTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = realTimeZone;
  focusManager.setFocused(undefined);
  midnightTimers = [];
  setSystemTime();
});

test("the day rolls at the new zone's midnight after the zone changes and the tab regains focus", () => {
  process.env.TZ = "America/New_York";
  setSystemTime(new Date("2026-10-16T16:00:00Z"));
  holdLongTimers();
  render(<Today />);

  process.env.TZ = "Europe/London";
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  advanceTo("2026-10-16T23:00:01Z");

  expect(screen.getByLabelText("today").textContent).toBe("2026-10-17");
});

test("an unmounted page leaves no midnight timer behind after the tab regains focus", () => {
  process.env.TZ = "America/New_York";
  setSystemTime(new Date("2026-10-16T16:00:00Z"));
  holdLongTimers();
  const view = render(<Today />);
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  view.unmount();

  expect(midnightTimers).toEqual([]);
});
