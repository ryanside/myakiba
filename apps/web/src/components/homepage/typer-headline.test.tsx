import { afterEach, beforeEach, expect, jest, spyOn, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { TyperHeadline } from "./typer-headline";

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

function charClasses(container: HTMLElement) {
  return [...container.querySelectorAll(".char")].map((char) => char.className);
}

test("scrambles the headline in when motion is on", () => {
  const { container } = render(<TyperHeadline text="Hi there" delayMs={100} />);
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(charClasses(container).some((name) => name !== "char")).toBe(true);
});

test("shows the headline at once under the app's Reduce motion switch", () => {
  localStorage.setItem("appearance:reduceMotion", "true");
  const { container } = render(<TyperHeadline text="Hi there" delayMs={100} />);
  const settled = Array.from({ length: 7 }, () => "char");
  expect(charClasses(container)).toEqual(settled);
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(charClasses(container)).toEqual(settled);
});

test("shows the headline at once under the device's reduced-motion setting", () => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  Object.defineProperty(media, "matches", { value: true });
  const matchMedia = spyOn(window, "matchMedia").mockReturnValue(media);
  try {
    const { container } = render(<TyperHeadline text="Hi there" delayMs={100} />);
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(charClasses(container)).toEqual(Array.from({ length: 7 }, () => "char"));
  } finally {
    matchMedia.mockRestore();
  }
});
