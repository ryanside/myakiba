import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { QuickFilterChips } from "./quick-filter-chips";

afterEach(cleanup);

const OPTIONS = ["Ordered", "Paid", "Shipped"] as const;
type Option = (typeof OPTIONS)[number];

function Owner({ initial, isAll }: { readonly initial: Option[]; readonly isAll?: boolean }) {
  const [selected, setSelected] = useState<Option[]>(initial);
  return (
    <>
      <QuickFilterChips
        options={OPTIONS}
        selected={selected}
        isAll={isAll}
        onChange={setSelected}
      />
      <output>{selected.join(",") || "none"}</output>
    </>
  );
}

const chip = (name: string) => screen.getByRole("button", { name });

describe("QuickFilterChips", () => {
  test("All is pressed while nothing is selected", () => {
    render(<Owner initial={[]} />);
    expect(chip("All").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Paid").getAttribute("aria-pressed")).toBe("false");
  });

  test("pressing an option from All selects only that option", async () => {
    render(<Owner initial={[]} />);
    await userEvent.click(chip("Paid"));
    expect(screen.getByRole("status").textContent).toBe("Paid");
    expect(chip("All").getAttribute("aria-pressed")).toBe("false");
  });

  test("options keep the order they were pressed in", async () => {
    render(<Owner initial={[]} />);
    await userEvent.click(chip("Shipped"));
    await userEvent.click(chip("Ordered"));
    expect(screen.getByRole("status").textContent).toBe("Shipped,Ordered");
  });

  test("pressing All clears the selection", async () => {
    render(<Owner initial={["Paid", "Shipped"]} />);
    await userEvent.click(chip("All"));
    expect(screen.getByRole("status").textContent).toBe("none");
    expect(chip("All").getAttribute("aria-pressed")).toBe("true");
  });

  test("a filter with no chip selected leaves All unpressed, and All clears it", async () => {
    const cleared: Option[][] = [];
    render(
      <QuickFilterChips
        options={OPTIONS}
        selected={[]}
        isAll={false}
        onChange={(next) => cleared.push(next)}
      />,
    );
    expect(chip("All").getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(chip("All"));
    expect(cleared).toEqual([[]]);
  });
});
