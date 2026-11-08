import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Result } from "better-result";
import { useState } from "react";
import { InlineTextCell } from "./inline-text-cell";

afterEach(cleanup);

/** A cell whose save disables it until `finish` runs, as the Orders table's pending rows do. */
function PendingCell({ onReady }: { readonly onReady: (finish: () => void) => void }) {
  const [saving, setSaving] = useState(false);
  return (
    <InlineTextCell
      label="Title"
      value="Spring"
      disabled={saving}
      onSubmit={async () => {
        setSaving(true);
        await new Promise<void>((resolve) => {
          onReady(() => {
            setSaving(false);
            resolve();
          });
        });
        return Result.ok();
      }}
    />
  );
}

test("focus comes back to the preview once a save stops disabling it, and the next focus edits", async () => {
  const held: (() => void)[] = [];
  render(<PendingCell onReady={(done) => held.push(done)} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /edit Title$/ }));
  await user.keyboard("Summer{Enter}");
  await waitFor(() =>
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /edit Title$/ }).disabled).toBe(
      true,
    ),
  );

  held[0]?.();
  await waitFor(() =>
    expect(document.activeElement === screen.getByRole("button", { name: /edit Title$/ })).toBe(
      true,
    ),
  );
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();

  await user.tab();
  await user.tab({ shift: true });
  expect(await screen.findByRole("textbox", { name: "Title" })).toBeDefined();
});

test("focus that moved on during a save stays where it went", async () => {
  const held: (() => void)[] = [];
  render(
    <>
      <PendingCell onReady={(done) => held.push(done)} />
      <input aria-label="Elsewhere" />
    </>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /edit Title$/ }));
  await user.keyboard("Summer{Enter}");
  const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" });
  elsewhere.focus();

  held[0]?.();
  await waitFor(() =>
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /edit Title$/ }).disabled).toBe(
      false,
    ),
  );
  expect(document.activeElement === elsewhere).toBe(true);
});

test("the preview and the input are the app's 32px controls, with no size of their own", async () => {
  render(<InlineTextCell label="Title" value="Spring" onSubmit={async () => Result.ok()} />);
  const preview = screen.getByRole("button", { name: /edit Title$/ });
  const sizes = (element: Element) =>
    element.className.split(/\s+/u).filter((name) => /^(?:h|min-h|py)-/u.test(name));
  expect(sizes(preview)).toEqual(["h-8"]);

  await userEvent.setup().click(preview);
  expect(sizes(screen.getByRole("textbox"))).toEqual(["py-1", "h-8"]);
});

test("an icon after the value is part of the one control, and clicking it edits", async () => {
  render(
    <InlineTextCell
      label="Title"
      value="Spring"
      previewIcon={<svg data-testid="pencil" aria-hidden="true" />}
      onSubmit={async () => Result.ok()}
    />,
  );
  const preview = screen.getByRole("button", { name: /edit Title$/ });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(preview.lastElementChild).toBe(screen.getByTestId("pencil"));

  await userEvent.setup().click(screen.getByTestId("pencil"));

  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Title" }).value).toBe("Spring");
});

test("a cell that fits its content leaves the row's width alone, and one that does not fills it", async () => {
  const widths = (element: Element) =>
    element.className.split(/\s+/u).filter((name) => name.startsWith("w-"));
  const user = userEvent.setup();

  const { unmount } = render(
    <InlineTextCell label="Title" value="Spring" onSubmit={async () => Result.ok()} />,
  );
  expect(widths(screen.getByRole("button", { name: /edit Title$/ }))).toEqual([
    "w-[calc(100%+1rem)]",
  ]);
  await user.click(screen.getByRole("button", { name: /edit Title$/ }));
  expect(widths(screen.getByRole("textbox"))).toEqual(["w-[calc(100%+1rem)]"]);
  expect(screen.getByRole("textbox").getAttribute("size")).toBeNull();
  unmount();

  render(
    <InlineTextCell label="Title" value="Spring" fitContent onSubmit={async () => Result.ok()} />,
  );
  expect(widths(screen.getByRole("button", { name: /edit Title$/ }))).toEqual(["w-fit"]);
  await user.click(screen.getByRole("button", { name: /edit Title$/ }));
  const input = screen.getByRole("textbox");
  expect(widths(input)).toEqual(["w-auto"]);
  expect(input.getAttribute("size")).toBe("20");
  await user.clear(input);
  await user.keyboard("A".repeat(40));
  expect(input.getAttribute("size")).toBe("41");
});
