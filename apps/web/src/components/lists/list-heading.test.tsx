import { afterAll, afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListHeading } from "./list-heading";

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve() },
});
afterAll(() => {
  Reflect.deleteProperty(document, "fonts");
});
afterEach(cleanup);

test("a short multiline description can be expanded to read its saved line breaks", async () => {
  await act(async () => {
    render(<ListHeading title="Shopping" description={"Buy first\nBuy later"} count="2 items" />);
  });

  const more = screen.getByRole("button", { name: "More" });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(more);

  const less = screen.getByRole("button", { name: "Less" });
  expect(less.getAttribute("aria-expanded")).toBe("true");
  const description = screen.getByText(/Buy first/);
  expect(description.textContent).toBe("Buy first\nBuy later");
  expect(description.classList.contains("whitespace-pre-wrap")).toBe(true);

  await act(async () => {
    fireEvent.click(less);
  });
  expect(screen.getByRole("button", { name: "More" }).getAttribute("aria-expanded")).toBe("false");
});

test("a short single-line description needs no expansion toggle", async () => {
  await act(async () => {
    render(<ListHeading title="Shopping" description="Buy first" count="2 items" />);
  });
  expect(screen.queryByRole("button")).toBeNull();
});

test("a lone carriage return needs no expansion toggle", async () => {
  await act(async () => {
    render(<ListHeading title="Shopping" description={"Buy first\rBuy later"} count="2 items" />);
  });
  expect(screen.queryByRole("button", { name: "More" })).toBeNull();
});

function expectPillToggle(toggle: HTMLElement, expanded: boolean): void {
  expect(toggle.dataset.slot).toBe("button");
  expect(toggle.classList.contains("rounded-full")).toBe(true);
  expect(toggle.getAttribute("aria-expanded")).toBe(String(expanded));
  expect(toggle.getAttribute("aria-controls")).toBeTruthy();
}

test("the expansion toggle is a pill button right after the description", async () => {
  await act(async () => {
    render(<ListHeading title="Shopping" description={"Buy first\nBuy later"} count="2 items" />);
  });

  const more = screen.getByRole("button", { name: "More" });
  expectPillToggle(more, false);
  expect(more.previousElementSibling?.textContent).toBe("Buy first\nBuy later");

  fireEvent.click(more);
  const less = screen.getByRole("button", { name: "Less" });
  expectPillToggle(less, true);
  expect(less.parentElement?.firstElementChild?.textContent).toBe("Buy first\nBuy later");
});

test("without a description the expansion toggle is a pill button after the count", async () => {
  Object.defineProperty(HTMLHeadingElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => 1000,
  });
  try {
    await act(async () => {
      render(<ListHeading title="A very long title" description="" count="2 items" />);
    });

    const more = screen.getByRole("button", { name: "More" });
    expectPillToggle(more, false);
    expect(more.parentElement?.textContent).toBe("2 itemsMore");
  } finally {
    Reflect.deleteProperty(HTMLHeadingElement.prototype, "scrollWidth");
  }
});
