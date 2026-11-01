import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { useGlide } from "./use-glide";

type Flight = { readonly frames: readonly Record<string, string | number>[]; cancelled: boolean };

function measuredElement() {
  const element = document.createElement("div");
  const flights: Flight[] = [];
  let width = 100;
  // A running animation holds the element partway, wherever its content has settled.
  let midFlight: number | null = null;
  element.getBoundingClientRect = () => ({ width: midFlight ?? width, height: 20 }) as DOMRect;
  element.animate = ((frames: Flight["frames"]) => {
    const flight: Flight = { frames, cancelled: false };
    flights.push(flight);
    midFlight = 130;
    return {
      cancel: () => {
        flight.cancelled = true;
        midFlight = null;
      },
    } as Animation;
  }) as typeof element.animate;
  return { element, flights, setWidth: (next: number) => (width = next) };
}

function glide(element: HTMLElement) {
  return renderHook(
    ({ change }) => {
      const ref = useGlide<HTMLElement>(change);
      ref.current = element;
    },
    { initialProps: { change: "a" } },
  );
}

const realResizeObserver = globalThis.ResizeObserver;
let resized = () => {};

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = false;
  window.dispatchEvent(new Event("pointerdown"));
  resized = () => {};
  globalThis.ResizeObserver = class extends realResizeObserver {
    constructor(onResize: ResizeObserverCallback) {
      super(onResize);
      resized = () => onResize([], this);
    }
  };
});
afterEach(() => {
  MotionGlobalConfig.skipAnimations = false;
  globalThis.ResizeObserver = realResizeObserver;
  cleanup();
});

// The hook reads its element once mounted, so the first render here records the settled size.
const settle = (view: ReturnType<typeof glide>) => view.rerender({ change: "settled" });

test("nothing moves until the content changes, and a change glides from the old size", () => {
  const { element, flights, setWidth } = measuredElement();
  const view = glide(element);
  settle(view);
  expect(flights).toEqual([]);

  setWidth(160);
  view.rerender({ change: "b" });

  expect(flights).toHaveLength(1);
  expect(flights[0]?.frames[0]?.width).toBe("100px");
  expect(flights[0]?.frames[1]?.width).toBe("160px");
});

test("a resize that re-wraps the content moves where the next glide starts from", () => {
  const { element, flights, setWidth } = measuredElement();
  const view = glide(element);
  settle(view);

  setWidth(140);
  resized();
  setWidth(160);
  view.rerender({ change: "b" });

  expect(flights[0]?.frames[0]?.width).toBe("140px");
  expect(flights[0]?.frames[1]?.width).toBe("160px");
});

test("a change that leaves the size alone starts nothing", () => {
  const { element, flights } = measuredElement();
  const view = glide(element);
  settle(view);
  view.rerender({ change: "b" });
  expect(flights).toEqual([]);
});

test("a change during a glide turns it around from where it is", () => {
  const { element, flights, setWidth } = measuredElement();
  const view = glide(element);
  settle(view);
  setWidth(200);
  view.rerender({ change: "b" });
  setWidth(120);
  view.rerender({ change: "c" });

  expect(flights).toHaveLength(2);
  expect(flights[0]?.cancelled).toBe(true);
  expect(flights[1]?.frames[0]?.width).toBe("130px");
  expect(flights[1]?.frames[1]?.width).toBe("120px");
});

test("reduced motion goes straight to the new size", () => {
  const { element, flights, setWidth } = measuredElement();
  const view = glide(element);
  settle(view);
  MotionGlobalConfig.skipAnimations = true;
  setWidth(160);
  view.rerender({ change: "b" });
  expect(flights).toEqual([]);
});

test("a change made from the keyboard goes straight to the new size", () => {
  const { element, flights, setWidth } = measuredElement();
  const view = glide(element);
  settle(view);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
  setWidth(160);
  view.rerender({ change: "b" });
  expect(flights).toEqual([]);
});
