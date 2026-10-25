import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type {
  AnalyticsSectionSort,
  AnalyticsSectionSortOrder,
} from "@myakiba/contracts/analytics/schema";

let now = 0;
let nextFrame = 0;
const callbacks = new Map<number, FrameRequestCallback>();
spyOn(performance, "now").mockImplementation(() => now);
spyOn(globalThis, "requestAnimationFrame").mockImplementation((onFrame) => {
  const id = ++nextFrame;
  callbacks.set(id, onFrame);
  return id;
});
spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
  callbacks.delete(id);
});
// happy-dom runs Element.animate on real timers, so Motion would animate out of reach of `frame`.
Reflect.deleteProperty(Element.prototype, "animate");
const frame = async (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    now += 16;
    const timestamp = now;
    const pending = [...callbacks.values()];
    callbacks.clear();
    await act(async () => {
      for (const onFrame of pending) onFrame(timestamp);
    });
  }
};

await mock.module("@/hooks/use-user-preferences", () => ({
  useUserPreferences: () => ({ currency: "USD", locale: "en-US", dateFormat: "MM/DD/YYYY" }),
}));
const { Route: AppRoot } = await import("@/routes/__root");
const { SectionTable } = await import("@/components/analytics/section-table");
const { EvilBrush } = await import("@/components/evilcharts/ui/recharts-brush");
const { animate, motionValue } = await import("motion/react");

let prefersReducedMotion = false;
const mediaQueries = new Set<MediaQueryList>();
const matchMedia = window.matchMedia.bind(window);
spyOn(window, "matchMedia").mockImplementation((query) => {
  const mediaQuery = matchMedia(query);
  Object.defineProperty(mediaQuery, "matches", {
    get: () => prefersReducedMotion && query.includes("prefers-reduced-motion"),
  });
  mediaQueries.add(mediaQuery);
  return mediaQuery;
});
function setPrefersReducedMotion(value: boolean) {
  prefersReducedMotion = value;
  act(() => {
    for (const mediaQuery of mediaQueries) mediaQuery.dispatchEvent(new Event("change"));
  });
}

beforeEach(() => {
  localStorage.clear();
  setPrefersReducedMotion(false);
});
afterEach(cleanup);
afterAll(() => mock.restore());

async function renderInApp(page: () => ReactNode) {
  const root = createRootRoute({ component: AppRoot.options.component });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/", component: page }),
    ]),
    history: createMemoryHistory(),
  });
  render(<RouterProvider router={router} />);
  await screen.findByTestId("page");
  await frame(32);
}

const rows = [
  { id: "1", name: "Alter", itemCount: 3, totalSpent: 12_000 },
  { id: "2", name: "Kotobukiya", itemCount: 1, totalSpent: 4000 },
];

function SortableArtists() {
  const [sort, setSort] = useState<AnalyticsSectionSort>();
  const [order, setOrder] = useState<AnalyticsSectionSortOrder>();
  return (
    <div data-testid="page">
      <SectionTable
        rows={rows}
        sectionName="artists"
        offset={0}
        isLoading={false}
        sort={sort}
        order={order}
        onSortChange={(nextSort, nextOrder) => {
          setSort(nextSort);
          setOrder(nextOrder);
        }}
      />
    </div>
  );
}

function sortIcons() {
  const header = screen.getByRole("button", { name: /^Sort by name/ });
  return [...header.querySelectorAll<HTMLElement>(":scope > span.inline-flex")].map((icon) => ({
    opacity: Number(icon.style.opacity || 1),
    filter: icon.style.filter || "none",
  }));
}

async function sortIconsAfterSortClick(ms: number) {
  fireEvent.click(screen.getByRole("button", { name: /^Sort by name/ }));
  await frame(ms);
  return sortIcons();
}

const settled = [{ opacity: 1, filter: "blur(0px)" }];

describe("analytics sort icons", () => {
  test("cross-fade when motion is on, and the old icon leaves", async () => {
    await renderInApp(SortableArtists);
    const midway = await sortIconsAfterSortClick(32);
    expect(midway.some((icon) => icon.opacity < 1)).toBe(true);
    await frame(600);
    expect(sortIcons()).toEqual(settled);
  });

  test("swap at once under the device's reduced-motion setting", async () => {
    await renderInApp(SortableArtists);
    setPrefersReducedMotion(true);
    expect(await sortIconsAfterSortClick(32)).toEqual(settled);
  });

  test("swap at once under the app's Reduce motion switch", async () => {
    localStorage.setItem("appearance:reduceMotion", "true");
    await renderInApp(SortableArtists);
    expect(await sortIconsAfterSortClick(32)).toEqual(settled);
  });
});

const points = Array.from({ length: 11 }, (_, index) => ({ bucket: `${index}`, value: index }));

function ControlledBrush() {
  const [startIndex, setStartIndex] = useState(0);
  return (
    <div data-testid="page">
      <button type="button" onClick={() => setStartIndex(5)}>
        Zoom to the second half
      </button>
      <EvilBrush
        data={points}
        chartConfig={{ value: { label: "Value" } }}
        xDataKey="bucket"
        startIndex={startIndex}
        endIndex={10}
      />
    </div>
  );
}

async function hiddenLeftWidthAfterZoom(ms: number) {
  fireEvent.click(screen.getByRole("button", { name: "Zoom to the second half" }));
  await frame(ms);
  const overlay = document.querySelector<HTMLElement>(".rounded-l-md");
  if (!overlay) throw new Error("Missing the brush's left overlay");
  return Number.parseFloat(overlay.style.width);
}

describe("chart brush", () => {
  test("glides to a new range when motion is on", async () => {
    await renderInApp(ControlledBrush);
    const midway = await hiddenLeftWidthAfterZoom(32);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(50);
    await frame(1000);
    expect(await hiddenLeftWidthAfterZoom(0)).toBeCloseTo(50, 1);
  });

  test("jumps to a new range under the device's reduced-motion setting", async () => {
    await renderInApp(ControlledBrush);
    setPrefersReducedMotion(true);
    expect(await hiddenLeftWidthAfterZoom(32)).toBe(50);
  });

  test("jumps to a new range under the app's Reduce motion switch", async () => {
    localStorage.setItem("appearance:reduceMotion", "true");
    await renderInApp(ControlledBrush);
    expect(await hiddenLeftWidthAfterZoom(32)).toBe(50);
  });
});

describe("app root", () => {
  test("lets Motion animate again after it unmounts", async () => {
    localStorage.setItem("appearance:reduceMotion", "true");
    await renderInApp(() => <div data-testid="page" />);
    cleanup();
    localStorage.clear();
    const value = motionValue(0);
    const animation = animate(value, 100, { duration: 0.4, ease: "linear" });
    await frame(80);
    animation.stop();
    expect(value.get()).toBeGreaterThan(0);
    expect(value.get()).toBeLessThan(100);
  });

  const markedForReducedMotion = () => document.documentElement.dataset.reduceMotion !== undefined;

  test("marks the page for reduced motion from its first render under the device setting", async () => {
    setPrefersReducedMotion(true);
    await renderInApp(() => <div data-testid="page" />);
    expect(markedForReducedMotion()).toBe(true);
  });

  test("marks the page for reduced motion from its first render under the app's switch", async () => {
    localStorage.setItem("appearance:reduceMotion", "true");
    await renderInApp(() => <div data-testid="page" />);
    expect(markedForReducedMotion()).toBe(true);
  });

  test("marks the page only while the device setting or the app's switch asks for it", async () => {
    await renderInApp(() => <div data-testid="page" />);
    expect(markedForReducedMotion()).toBe(false);
    setPrefersReducedMotion(true);
    expect(markedForReducedMotion()).toBe(true);
    setPrefersReducedMotion(false);
    expect(markedForReducedMotion()).toBe(false);
    act(() => {
      localStorage.setItem("appearance:reduceMotion", "true");
      window.dispatchEvent(new StorageEvent("storage", { key: "appearance:reduceMotion" }));
    });
    expect(markedForReducedMotion()).toBe(true);
  });
});
