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

  const more = screen.getByRole("button", { name: "more" });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(more);

  const less = screen.getByRole("button", { name: "less" });
  expect(less.getAttribute("aria-expanded")).toBe("true");
  const description = screen.getByText(/Buy first/);
  expect(description.textContent).toBe("Buy first\nBuy later");
  expect(description.classList.contains("whitespace-pre-wrap")).toBe(true);

  await act(async () => {
    fireEvent.click(less);
  });
  expect(screen.getByRole("button", { name: "more" }).getAttribute("aria-expanded")).toBe("false");
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
  expect(screen.queryByRole("button", { name: "more" })).toBeNull();
});
