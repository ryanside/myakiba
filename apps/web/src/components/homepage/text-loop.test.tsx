import { afterEach, expect, jest, spyOn, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TextLoop } from "./text-loop";

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

test("reduced motion switches loop text without waiting for a fade", () => {
  jest.useFakeTimers();
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  Object.defineProperty(media, "matches", { value: true });
  const matchMedia = spyOn(window, "matchMedia").mockReturnValue(media);
  try {
    render(<TextLoop preText="Track" texts={["figures", "books"]} interval={3000} />);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("books") !== null).toBe(true);
    expect(screen.queryByText("figures") === null).toBe(true);
  } finally {
    matchMedia.mockRestore();
  }
});

test("normal motion switches loop text after its fade", () => {
  jest.useFakeTimers();
  render(<TextLoop preText="Track" texts={["figures", "books"]} interval={3000} />);
  act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(screen.getByText("figures").classList.contains("opacity-0")).toBe(true);
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(screen.getByText("books").classList.contains("opacity-100")).toBe(true);
});

test("enabling reduced motion during a fade keeps loop text visible", () => {
  jest.useFakeTimers();
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = false;
  Object.defineProperty(media, "matches", { get: () => reducedMotion });
  const matchMedia = spyOn(window, "matchMedia").mockReturnValue(media);
  try {
    render(<TextLoop preText="Track" texts={["figures", "books"]} interval={3000} />);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("figures").classList.contains("opacity-0")).toBe(true);
    act(() => {
      reducedMotion = true;
      media.dispatchEvent(new Event("change"));
    });
    expect(screen.getByText("figures").classList.contains("opacity-100")).toBe(true);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("books").classList.contains("opacity-100")).toBe(true);
  } finally {
    matchMedia.mockRestore();
  }
});
