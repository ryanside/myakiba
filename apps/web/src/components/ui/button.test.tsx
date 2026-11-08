import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button";

afterEach(cleanup);

function renderButton(width: number, onPointerDown?: () => void): HTMLElement {
  render(<Button onPointerDown={onPointerDown}>Save</Button>);
  const button = screen.getByRole("button", { name: "Save" });
  Object.defineProperty(button, "offsetWidth", { value: width });
  return button;
}

describe("Button press", () => {
  test("a pointer press hands the button's width to the press", () => {
    const button = renderButton(600);
    fireEvent.pointerDown(button);
    expect(button.style.getPropertyValue("--press-width")).toBe("600");
  });

  test("a key press hands the button's width to the press", () => {
    const button = renderButton(320);
    fireEvent.keyDown(button, { key: " " });
    expect(button.style.getPropertyValue("--press-width")).toBe("320");
  });

  test("the caller's pointer handler still runs", () => {
    let calls = 0;
    const button = renderButton(120, () => {
      calls += 1;
    });
    fireEvent.pointerDown(button);
    expect(calls).toBe(1);
  });
});
