import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

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

describe("app root", () => {
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
