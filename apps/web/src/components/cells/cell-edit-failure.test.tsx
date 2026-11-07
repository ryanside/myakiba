import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InlineCountCell } from "./inline-count-cell";
import { InlineTextCell } from "./inline-text-cell";

afterEach(() => {
  cleanup();
});

function failingWrite<Value>() {
  const writes: Value[] = [];
  const onSubmit = async (value: Value) => {
    writes.push(value);
    throw new Error("write failed");
  };
  return { writes, onSubmit };
}

async function settle() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
}

describe("a failed cell edit", () => {
  test("pressing Enter in a text cell leaves no unhandled rejection", async () => {
    const { writes, onSubmit } = failingWrite<string>();
    render(<InlineTextCell label="Shop" value="AmiAmi" onSubmit={onSubmit} />);

    fireEvent.focus(screen.getByRole("button", { name: /edit Shop$/i }));
    fireEvent.change(screen.getByLabelText("Shop"), { target: { value: "HLJ" } });
    fireEvent.keyDown(screen.getByLabelText("Shop"), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /edit Shop$/i }).textContent).toBe("AmiAmi"),
    );
    await settle();

    expect(writes).toEqual(["HLJ"]);
  });

  test("leaving a text cell leaves no unhandled rejection", async () => {
    const { writes, onSubmit } = failingWrite<string>();
    render(<InlineTextCell label="Shop" value="AmiAmi" onSubmit={onSubmit} />);

    fireEvent.focus(screen.getByRole("button", { name: /edit Shop$/i }));
    fireEvent.change(screen.getByLabelText("Shop"), { target: { value: "HLJ" } });
    fireEvent.blur(screen.getByLabelText("Shop"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /edit Shop$/i }).textContent).toBe("AmiAmi"),
    );
    await settle();

    expect(writes).toEqual(["HLJ"]);
  });

  test("pressing Enter in a count cell leaves no unhandled rejection", async () => {
    const { writes, onSubmit } = failingWrite<number>();
    render(<InlineCountCell label="Count" value={1} onSubmit={onSubmit} />);

    const countButtonName = screen.getByRole("button").hasAttribute("aria-label")
      ? "1, edit Count"
      : "1";
    fireEvent.click(screen.getByRole("button", { name: countButtonName }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: countButtonName })).toBeDefined(),
    );
    await settle();

    expect(writes).toEqual([3]);
  });
});
