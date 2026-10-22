import { afterAll, afterEach, expect, jest, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

const navigate = mock(() => Promise.resolve());
const router = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({ ...router, useNavigate: () => navigate }));
const { OrdersBarChart } = await import("./orders-bar-chart");

spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
  () => new DOMRect(0, 0, 700, 200),
);

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
  fireEvent.mouseUp(pressedBar);
  fireEvent.click(pressedBar);
  expect(navigate).toHaveBeenCalledWith({
    to: "/orders",
    search: { releaseDateStart: "2026-08-01", releaseDateEnd: "2026-08-31" },
  });
});
