import { afterEach, describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { Saving } from "@/data/client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { Toaster } from "@/components/ui/toast";
import { InlineCountCell } from "./inline-count-cell";
import { InlineCurrencyCell } from "./inline-currency-cell";
import { InlineTextCell } from "./inline-text-cell";

afterEach(() => {
  cleanup();
});

function recordedWrites<Value>() {
  const writes: Value[] = [];
  const onSubmit = async (value: Value) => {
    writes.push(value);
    return Result.ok();
  };
  return { writes, onSubmit };
}

type CellCase<Value> = {
  name: string;
  render: (onSubmit: (value: Value) => Saving) => ReactElement;
  trigger: string;
  open: (trigger: HTMLElement) => void;
  editor: () => HTMLElement;
  typed: string;
  saved: Value;
};

const textCell: CellCase<string> = {
  name: "text",
  render: (onSubmit) => <InlineTextCell label="Shop" value="AmiAmi" onSubmit={onSubmit} />,
  trigger: "AmiAmi, edit Shop",
  open: (trigger) => fireEvent.focus(trigger),
  editor: () => screen.getByRole("textbox", { name: "Shop" }),
  typed: "HLJ",
  saved: "HLJ",
};

const countCell: CellCase<number> = {
  name: "count",
  render: (onSubmit) => <InlineCountCell label="Count" value={2} onSubmit={onSubmit} />,
  trigger: "2, edit Count",
  open: (trigger) => fireEvent.click(trigger),
  editor: () => screen.getByRole("spinbutton", { name: "Count" }),
  typed: "3",
  saved: 3,
};

const currencyCell: CellCase<number> = {
  name: "currency",
  render: (onSubmit) => (
    <InlineCurrencyCell
      label="Price"
      value={1000}
      currency="USD"
      locale="en-US"
      onSubmit={onSubmit}
    />
  ),
  trigger: "$10.00, edit Price",
  open: (trigger) => fireEvent.click(trigger),
  editor: () => screen.getByRole("textbox", { name: "Price" }),
  typed: "25",
  saved: 2500,
};

describe.each([textCell, countCell, currencyCell] as CellCase<unknown>[])(
  "an inline $name cell",
  (cell) => {
    test("names its trigger after the value it shows", () => {
      render(cell.render(async () => Result.ok()));
      expect(screen.getByRole("button", { name: cell.trigger })).toBeDefined();
    });

    test("saves what was typed on Enter", async () => {
      const { writes, onSubmit } = recordedWrites<unknown>();
      render(cell.render(onSubmit));

      cell.open(screen.getByRole("button", { name: cell.trigger }));
      fireEvent.change(cell.editor(), { target: { value: cell.typed } });
      fireEvent.keyDown(cell.editor(), { key: "Enter" });

      await waitFor(() => expect(writes).toEqual([cell.saved]));
    });

    test("closes on Escape and saves nothing", async () => {
      const { writes, onSubmit } = recordedWrites<unknown>();
      render(cell.render(onSubmit));

      cell.open(screen.getByRole("button", { name: cell.trigger }));
      fireEvent.change(cell.editor(), { target: { value: cell.typed } });
      fireEvent.keyDown(cell.editor(), { key: "Escape" });

      await waitFor(() => expect(screen.getByRole("button", { name: cell.trigger })).toBeDefined());
      expect(writes).toEqual([]);
    });

    test("saves nothing on Enter when the value is unchanged", async () => {
      const { writes, onSubmit } = recordedWrites<unknown>();
      render(cell.render(onSubmit));

      cell.open(screen.getByRole("button", { name: cell.trigger }));
      fireEvent.keyDown(cell.editor(), { key: "Enter" });

      await waitFor(() => expect(screen.getByRole("button", { name: cell.trigger })).toBeDefined());
      expect(writes).toEqual([]);
    });
  },
);

describe("an inline text cell", () => {
  test("shows a dash for an empty value and names its trigger Empty", () => {
    render(<InlineTextCell label="Shop" value="" onSubmit={async () => Result.ok()} />);
    expect(screen.getByRole("button", { name: "Empty, edit Shop" }).textContent).toBe("—");
  });

  test("shows the saved value while the save is pending", async () => {
    render(<InlineTextCell label="Shop" value="AmiAmi" onSubmit={() => new Promise(() => {})} />);

    fireEvent.focus(screen.getByRole("button", { name: "AmiAmi, edit Shop" }));
    fireEvent.change(screen.getByLabelText("Shop"), { target: { value: "HLJ" } });
    fireEvent.keyDown(screen.getByLabelText("Shop"), { key: "Enter" });

    const trigger = await screen.findByRole("button", { name: "HLJ, edit Shop" });
    expect(trigger.textContent).toBe("HLJ");
  });

  test("shows the validation error and saves nothing when the typed value fails validation", async () => {
    const { writes, onSubmit } = recordedWrites<string>();
    render(
      <Toaster>
        <InlineTextCell
          label="Title"
          value="Spring order"
          onSubmit={onSubmit}
          validate={(value) => (value.trim() === "" ? "Order title cannot be empty" : true)}
        />
      </Toaster>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Spring order, edit Title" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  " } });
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Enter" });

    expect(await screen.findByText("Order title cannot be empty")).toBeDefined();
    expect(writes).toEqual([]);
  });

  test("does not validate a value left unchanged", async () => {
    const checked: string[] = [];
    render(
      <InlineTextCell
        label="Title"
        value="Spring order"
        onSubmit={async () => Result.ok()}
        validate={(value) => {
          checked.push(value);
          return true;
        }}
      />,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Spring order, edit Title" }));
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Spring order, edit Title" })).toBeDefined(),
    );
    expect(checked).toEqual([]);
  });
});

describe("an inline currency cell", () => {
  test("shows a dash for zero when zero means unknown, and names its trigger Empty", () => {
    render(
      <InlineCurrencyCell
        label="Price"
        value={0}
        currency="USD"
        locale="en-US"
        zeroAsEmpty
        onSubmit={async () => Result.ok()}
      />,
    );
    expect(screen.getByRole("button", { name: "Empty, edit Price" }).textContent).toBe("—");
  });

  test("saves nothing when the field is cleared", async () => {
    const { writes, onSubmit } = recordedWrites<number>();
    render(
      <InlineCurrencyCell
        label="Price"
        value={1000}
        currency="USD"
        locale="en-US"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "$10.00, edit Price" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Price" }), { target: { value: "" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Price" }), { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "$10.00, edit Price" })).toBeDefined(),
    );
    expect(writes).toEqual([]);
  });
});

describe("an inline count cell", () => {
  test("reads a cleared field as 1", async () => {
    const { writes, onSubmit } = recordedWrites<number>();
    render(<InlineCountCell label="Count" value={2} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "2, edit Count" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), { target: { value: "" } });
    expect((screen.getByRole("spinbutton", { name: "Count" }) as HTMLInputElement).value).toBe("1");
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Count" }), { key: "Enter" });

    await waitFor(() => expect(writes).toEqual([1]));
  });
});
