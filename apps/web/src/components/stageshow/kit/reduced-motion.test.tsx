import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { Stage } from "./stage";
import { useReducedMotion } from "./reduced-motion";

// The app reduces motion when the device asks or its own Reduce motion switch
// is on (hooks/use-appearance.ts). The demos must follow the same rule.
const REDUCE_MOTION_KEY = "appearance:reduceMotion";

let deviceReduces = false;
const matchMedia = window.matchMedia.bind(window);
spyOn(window, "matchMedia").mockImplementation((query) => {
  const mediaQuery = matchMedia(query);
  Object.defineProperty(mediaQuery, "matches", {
    get: () => deviceReduces && query.includes("prefers-reduced-motion"),
  });
  return mediaQuery;
});

// happy-dom has no font loading; the stage waits for fonts before it measures.
Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { status: "loaded", ready: Promise.resolve() },
});

// Every stage is on screen, so one that may move starts its script at once.
const realIntersectionObserver = globalThis.IntersectionObserver;
class OnScreen extends realIntersectionObserver {
  readonly #onChange: IntersectionObserverCallback;
  constructor(onChange: IntersectionObserverCallback) {
    super(onChange);
    this.#onChange = onChange;
  }
  override observe(target: Element) {
    const entry = { isIntersecting: true, target } as IntersectionObserverEntry;
    this.#onChange([entry], this);
  }
}

beforeEach(() => {
  localStorage.clear();
  deviceReduces = false;
  globalThis.IntersectionObserver = OnScreen;
});
afterEach(() => {
  cleanup();
  globalThis.IntersectionObserver = realIntersectionObserver;
});
afterAll(() => mock.restore());

type Scene = { readonly label: string };

function renderDemo(script: () => Promise<void>) {
  return render(
    <Stage<Scene>
      width={400}
      height={200}
      initial={{ label: "first frame" }}
      poster={{ label: "poster" }}
      script={script}
      play="loop"
    >
      {(s) => <p>{s.label}</p>}
    </Stage>,
  );
}

describe("stageshow reduced motion", () => {
  test("follows the app's Reduce motion switch when the device setting is off", () => {
    localStorage.setItem(REDUCE_MOTION_KEY, "true");
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  test("follows the device setting", () => {
    deviceReduces = true;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  test("moves when neither asks for less motion", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  test("a demo holds its poster and never runs its script under the app's switch", async () => {
    localStorage.setItem(REDUCE_MOTION_KEY, "true");
    let runs = 0;
    renderDemo(async () => {
      runs += 1;
      await new Promise<void>(() => {});
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("poster")).toBeDefined();
    expect(screen.queryByText("first frame")).toBeNull();
    expect(runs).toBe(0);
  });

  test("a demo runs its script when motion is allowed", async () => {
    let runs = 0;
    renderDemo(async () => {
      runs += 1;
      await new Promise<void>(() => {});
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("first frame")).toBeDefined();
    expect(runs).toBe(1);
  });
});
