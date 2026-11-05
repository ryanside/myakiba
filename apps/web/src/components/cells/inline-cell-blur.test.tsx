import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InlineCountCell } from "./inline-count-cell";
import { InlineCurrencyCell } from "./inline-currency-cell";

afterEach(() => {
  cleanup();
});

function recordedWrites<Value>() {
  const writes: Value[] = [];
  const onSubmit = async (value: Value) => {
    writes.push(value);
  };
  return { writes, onSubmit };
}

describe("leaving an inline cell keeps what was typed, like the Shop cell", () => {
  test("a price typed into a currency cell saves when focus leaves it", async () => {
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
    const input = screen.getByRole("textbox", { name: "Price" });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);

    await waitFor(() => expect(writes).toEqual([2500]));
  });

  test("a count typed into a count cell saves when focus leaves it", async () => {
    const { writes, onSubmit } = recordedWrites<number>();
    render(<InlineCountCell label="Count" value={1} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "1, edit Count" }));
    const input = screen.getByRole("spinbutton", { name: "Count" });
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);

    await waitFor(() => expect(writes).toEqual([3]));
  });

  test("leaving a cell without changing it writes nothing", async () => {
    const { writes, onSubmit } = recordedWrites<number>();
    render(<InlineCountCell label="Count" value={2} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "2, edit Count" }));
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Count" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "2, edit Count" })).toBeDefined(),
    );
    expect(writes).toEqual([]);
  });
});
