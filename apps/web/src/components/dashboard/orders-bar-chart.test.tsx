import { afterAll, afterEach, expect, jest, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

const navigate = mock(() => Promise.resolve());
const router = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({ ...router, useNavigate: () => navigate }));
const { OrdersBarChart } = await import("./orders-bar-chart");

spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
  () => new DOMRect(0, 0, 700, 200),
);

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
  for (const mediaQuery of mediaQueries) mediaQuery.dispatchEvent(new Event("change"));
}

jest.setSystemTime(new Date(2026, 9, 21));
afterAll(() => {
  jest.setSystemTime();
  mock.restore();
});
const data = [
  { month: 8, orderCount: 2 },
  { month: 10, orderCount: 1 },
];
afterEach(() => {
  cleanup();
  navigate.mockClear();
});
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
const frame = async (ms = 32) => {
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
function bar(container: HTMLElement, index: number) {
  const path = container.querySelectorAll(".recharts-bar-rectangle path").item(index);
  if (!path) throw new Error(`Missing order bar ${index}`);
  return path;
}

test("hovering during the order chart intro still grows every bar to its full height", async () => {
  const { container, rerender } = render(<OrdersBarChart data={[]} isLoading />);
  await frame(32);
  rerender(<OrdersBarChart data={data} isLoading={false} />);
  await frame(64);
  expect(Number(bar(container, 0).getAttribute("height"))).toBeLessThan(160);
  fireEvent.mouseOver(bar(container, 0));
  await frame(600);
  expect(Number(bar(container, 0).getAttribute("height"))).toBeCloseTo(160, 0);
  expect(Number(bar(container, 1).getAttribute("height"))).toBeCloseTo(80, 0);
});

test("switching hovered order bars navigates to the second month on the first click", async () => {
  const { container } = render(<OrdersBarChart data={data} />);
  await frame(600);
  fireEvent.mouseOver(bar(container, 1));
  await frame();
  fireEvent.mouseOver(bar(container, 0));
  await frame();
  const pressedBar = bar(container, 0);
  fireEvent.mouseDown(pressedBar);
  await frame(32);
  fireEvent.mouseUp(pressedBar);
  fireEvent.click(pressedBar);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith({
    to: "/orders",
    search: { releaseDateStart: "2026-08-01", releaseDateEnd: "2026-08-31" },
  });
});

test("a bar pressed while the hover highlight moves to it stays mounted and navigates on release", async () => {
  const { container } = render(<OrdersBarChart data={data} />);
  await frame(600);
  const pressedBar = bar(container, 0);
  fireEvent.mouseDown(pressedBar);
  fireEvent.mouseOver(pressedBar);
  await frame(32);
  expect(pressedBar.isConnected).toBe(true);
  expect(pressedBar.getAttribute("opacity")).toBe("1");
  expect(bar(container, 1).getAttribute("opacity")).toBe("0.2");
  expect(container.querySelector(".recharts-reference-line text")?.textContent).toBe("2");
  fireEvent.mouseUp(pressedBar);
  fireEvent.click(pressedBar);
  expect(navigate).toHaveBeenCalledWith({
    to: "/orders",
    search: { releaseDateStart: "2026-08-01", releaseDateEnd: "2026-08-31" },
  });
});

function monthLink(container: HTMLElement, name: string) {
  const link = container.querySelector<SVGElement>(`[role="link"][aria-label^="${name}:"]`);
  if (!link) throw new Error(`Missing ${name} order bar link`);
  return link;
}

test("each order bar is a link named for its month and count, and only the highlighted month is a tab stop", async () => {
  const { container } = render(<OrdersBarChart data={data} />);
  await frame(600);
  const links = [...container.querySelectorAll('[role="link"]')];
  expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
    "January: 0 orders",
    "February: 0 orders",
    "March: 0 orders",
    "April: 0 orders",
    "May: 0 orders",
    "June: 0 orders",
    "July: 0 orders",
    "August: 2 orders",
    "September: 0 orders",
    "October: 1 order",
    "November: 0 orders",
    "December: 0 orders",
  ]);
  expect(links.filter((link) => link.getAttribute("tabindex") === "0")).toEqual([
    monthLink(container, "October"),
  ]);
  expect(container.querySelector("svg.recharts-surface")?.hasAttribute("tabindex")).toBe(false);
});

test("arrow keys move the order chart highlight between months and Enter opens the focused month", async () => {
  const { container } = render(<OrdersBarChart data={data} />);
  await frame(600);
  act(() => monthLink(container, "October").focus());
  fireEvent.keyDown(document.activeElement ?? container, { key: "ArrowLeft" });
  fireEvent.keyDown(document.activeElement ?? container, { key: "ArrowLeft" });
  await frame();
  expect(document.activeElement).toBe(monthLink(container, "August"));
  expect(bar(container, 0).getAttribute("opacity")).toBe("1");
  expect(container.textContent).toContain("2 orders in August");
  fireEvent.keyDown(document.activeElement ?? container, { key: "End" });
  expect(document.activeElement).toBe(monthLink(container, "December"));
  fireEvent.keyDown(document.activeElement ?? container, { key: "Home" });
  expect(document.activeElement).toBe(monthLink(container, "January"));
  fireEvent.keyDown(document.activeElement ?? container, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(monthLink(container, "January"));
  fireEvent.keyDown(document.activeElement ?? container, { key: "ArrowRight" });
  fireEvent.keyDown(document.activeElement ?? container, { key: "Enter" });
  expect(navigate).toHaveBeenCalledWith({
    to: "/orders",
    search: { releaseDateStart: "2026-02-01", releaseDateEnd: "2026-02-28" },
  });
});

test("tabbing out of the order chart returns the highlight to the current month", async () => {
  const { container } = render(<OrdersBarChart data={data} />);
  await frame(600);
  act(() => monthLink(container, "August").focus());
  await frame();
  expect(container.textContent).toContain("2 orders in August");
  act(() => monthLink(container, "August").blur());
  await frame();
  expect(container.textContent).toContain("1 order in October");
  expect(monthLink(container, "October").getAttribute("tabindex")).toBe("0");
});

test("with reduced motion the order reference line jumps to the highlighted month", async () => {
  setPrefersReducedMotion(true);
  try {
    const { container } = render(<OrdersBarChart data={data} />);
    await frame(600);
    act(() => monthLink(container, "August").focus());
    await frame(16);
    expect(container.querySelector(".recharts-reference-line line")?.getAttribute("y1")).toBe(
      bar(container, 0).getAttribute("y"),
    );
  } finally {
    setPrefersReducedMotion(false);
  }
});

test("a focused month keeps the tab stop and the Enter target while the pointer highlights another month", async () => {
  const { container } = render(<OrdersBarChart data={data} />);
  await frame(600);
  const august = monthLink(container, "August");
  act(() => august.focus());
  fireEvent.mouseOver(bar(container, 1));
  await frame();
  expect(container.textContent).toContain("1 order in October");
  expect(document.activeElement).toBe(august);
  expect(august.isConnected).toBe(true);
  expect(
    [...container.querySelectorAll('[role="link"][tabindex="0"]')].map((link) =>
      link.getAttribute("aria-label"),
    ),
  ).toEqual(["August: 2 orders"]);
  const wrapper = container.querySelector(".recharts-wrapper");
  if (!wrapper) throw new Error("Missing order chart wrapper");
  fireEvent.mouseLeave(wrapper);
  await frame();
  expect(container.textContent).toContain("2 orders in August");
  fireEvent.keyDown(august, { key: "Enter" });
  expect(navigate).toHaveBeenCalledWith({
    to: "/orders",
    search: { releaseDateStart: "2026-08-01", releaseDateEnd: "2026-08-31" },
  });
});

test("a focused month keeps keyboard focus when the order counts refresh", async () => {
  const { container, rerender } = render(<OrdersBarChart data={data} />);
  await frame(600);
  act(() => monthLink(container, "August").focus());
  rerender(
    <OrdersBarChart
      data={[
        { month: 8, orderCount: 3 },
        { month: 10, orderCount: 1 },
      ]}
    />,
  );
  await frame(600);
  expect(document.activeElement?.getAttribute("aria-label")).toBe("August: 3 orders");
});
