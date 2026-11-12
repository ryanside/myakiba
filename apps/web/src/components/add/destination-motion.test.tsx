import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { Swap, useSlide, WORDS } from "./destination-motion";

type Flight = {
  readonly frames: readonly Keyframe[];
  readonly options: KeyframeAnimationOptions;
  cancelled: boolean;
};

/** An element whose top is the layout's until an animation holds it partway. */
function placedElement() {
  const element = document.createElement("div");
  const parent = document.createElement("div");
  parent.append(element);
  const flights: Flight[] = [];
  let top = 100;
  let midFlight: number | null = null;
  element.getBoundingClientRect = () => ({ top: midFlight ?? top }) as DOMRect;
  parent.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  element.animate = ((frames: Flight["frames"], options: Flight["options"]) => {
    const flight: Flight = { frames, options, cancelled: false };
    flights.push(flight);
    midFlight = 150;
    return {
      cancel: () => {
        flight.cancelled = true;
        midFlight = null;
      },
    } as Animation;
  }) as typeof element.animate;
  return { element, flights, moveTo: (next: number) => (top = next) };
}

function slide(element: HTMLElement) {
  return renderHook(
    ({ change }) => {
      const ref = useSlide<HTMLElement>(change);
      ref.current = element;
    },
    { initialProps: { change: "a" as string | null } },
  );
}

const nextFrames = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const pressKey = () => window.dispatchEvent(new Event("keydown"));

afterEach(() => {
  MotionGlobalConfig.skipAnimations = false;
  cleanup();
});

test("the table slides by transform from where it was to its new place", () => {
  const { element, flights, moveTo } = placedElement();
  const view = slide(element);
  expect(flights).toHaveLength(0);

  moveTo(400);
  view.rerender({ change: "b" });
  expect(flights).toHaveLength(1);
  expect(flights[0]?.frames).toEqual([
    { transform: "translateY(-300px)" },
    { transform: "translateY(0px)" },
  ]);
});

test("a new choice mid-flight carries on from where the table has got to", () => {
  const { element, flights, moveTo } = placedElement();
  const view = slide(element);

  moveTo(400);
  view.rerender({ change: "b" });
  moveTo(100);
  view.rerender({ change: "c" });

  expect(flights[0]?.cancelled).toBe(true);
  // Held at 150 by the first flight, and the layout is now at 100.
  expect(flights[1]?.frames[0]).toEqual({ transform: "translateY(350px)" });
});

test("a move that isn't a choice does not slide, and the next slide starts from it", () => {
  const { element, flights, moveTo } = placedElement();
  const view = slide(element);
  moveTo(200);
  view.rerender({ change: "a" });
  expect(flights).toHaveLength(0);

  moveTo(500);
  view.rerender({ change: "b" });
  expect(flights[0]?.frames[0]).toEqual({ transform: "translateY(-300px)" });
});

test("reduced motion lands at once", () => {
  const { element, flights, moveTo } = placedElement();
  const view = slide(element);
  MotionGlobalConfig.skipAnimations = true;
  moveTo(400);
  view.rerender({ change: "b" });
  expect(flights).toHaveLength(0);
});

test("the slide and the words take their curves from the motion tokens", () => {
  const root = document.documentElement.style;
  const { element, flights, moveTo } = placedElement();
  const view = slide(element);
  try {
    root.setProperty("--ease-out", "cubic-bezier(0.1, 0.2, 0.3, 0.4)");
    root.setProperty("--ease-in-out", "cubic-bezier(0.5, 0.6, 0.7, 0.8)");
    moveTo(400);
    view.rerender({ change: "b" });
    moveTo(100);
    view.rerender({ change: "c" });
    expect(flights.map((flight) => flight.options.easing)).toEqual([
      "cubic-bezier(0.1, 0.2, 0.3, 0.4)",
      "cubic-bezier(0.5, 0.6, 0.7, 0.8)",
    ]);
    expect(WORDS.at(false).transition.ease).toEqual([0.1, 0.2, 0.3, 0.4]);

    root.setProperty("--ease-out", "cubic-bezier(0.9, 0, 0.1, 1)");
    moveTo(400);
    view.rerender({ change: "d" });
    expect(flights[2]?.options.easing).toBe("cubic-bezier(0.9, 0, 0.1, 1)");
    expect(WORDS.gone(false).transition.ease).toEqual([0.9, 0, 0.1, 1]);
  } finally {
    root.removeProperty("--ease-out");
    root.removeProperty("--ease-in-out");
  }
});

test("nothing moves on first paint", () => {
  render(
    <Swap move={WORDS} id="Collection">
      Collection
    </Swap>,
  );
  expect(screen.getByText("Collection").style.opacity).not.toBe("0");
});

// A key press counts for a moment after it, so these come after every test that needs a pointer's choice.
test("a choice from the keyboard lands at once", () => {
  const { element, flights, moveTo } = placedElement();
  const view = slide(element);
  pressKey();
  moveTo(400);
  view.rerender({ change: "b" });
  expect(flights).toHaveLength(0);
});

test("words from a keyboard choice replace the old ones within two frames", async () => {
  const words = (id: string) => (
    <Swap move={WORDS} id={id}>
      {id}
    </Swap>
  );
  const view = render(words("Collection"));
  pressKey();
  view.rerender(words("New Order"));
  await act(nextFrames);
  expect(screen.getByText("New Order").style.opacity).toBe("1");
  expect(screen.queryByText("Collection")).toBeNull();
});
