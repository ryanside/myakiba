import { afterEach, describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InlineCountCell } from "./inline-count-cell";
import { InlineCurrencyCell } from "./inline-currency-cell";
import { InlineTextCell } from "./inline-text-cell";

afterEach(() => {
  cleanup();
});

const noop = async () => Result.ok();

// iOS Safari zooms the page into any focused field set below 16px, and --text-sm is 13px.
function fontSizeClasses(field: HTMLElement): string[] {
  return [...field.classList]
    .filter((token) => /^((sm|md|lg|xl):)?text-(xs|sm|base|lg)$/.test(token))
    .toSorted();
}

describe("an open cell editor is 16px on phones and 13px from md up", () => {
  test("in a text cell", () => {
    render(<InlineTextCell label="Shop" value="AmiAmi" onSubmit={noop} />);
    fireEvent.focus(screen.getByRole("button"));

    expect(fontSizeClasses(screen.getByRole("textbox", { name: "Shop" }))).toEqual([
      "md:text-sm",
      "text-base",
    ]);
  });

  test("in a count cell", () => {
    render(<InlineCountCell label="Count" value={1} onSubmit={noop} />);
    fireEvent.click(screen.getByRole("button"));

    expect(fontSizeClasses(screen.getByRole("spinbutton", { name: "Count" }))).toEqual([
      "md:text-sm",
      "text-base",
    ]);
  });

  test("in a currency cell", () => {
    render(
      <InlineCurrencyCell
        label="Price"
        value={1000}
        currency="USD"
        locale="en-US"
        onSubmit={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    expect(fontSizeClasses(screen.getByRole("textbox", { name: "Price" }))).toEqual([
      "md:text-sm",
      "text-base",
    ]);
  });
});
