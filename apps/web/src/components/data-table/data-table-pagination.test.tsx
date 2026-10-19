import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DataTablePagination } from "./data-table-pagination";

afterEach(cleanup);

const nextButton = () => screen.getByRole("button", { name: "Go to next page" });

function offsetRequestedBy(
  button: string,
  props: { totalCount: number; limit: number; offset: number },
) {
  let requested: number | undefined;
  render(<DataTablePagination {...props} onOffsetChange={(offset) => (requested = offset)} />);
  fireEvent.click(screen.getByRole("button", { name: button }));
  return requested;
}

describe("DataTablePagination", () => {
  test("a page past the end cannot go further", () => {
    render(
      <DataTablePagination
        totalCount={100}
        limit={24}
        offset={24 * 4999}
        onOffsetChange={() => {}}
      />,
    );
    expect(nextButton().hasAttribute("disabled")).toBe(true);
  });

  test("the last page cannot go further, and an earlier page can", () => {
    const { rerender } = render(
      <DataTablePagination totalCount={100} limit={24} offset={96} onOffsetChange={() => {}} />,
    );
    expect(nextButton().hasAttribute("disabled")).toBe(true);
    rerender(
      <DataTablePagination totalCount={100} limit={24} offset={72} onOffsetChange={() => {}} />,
    );
    expect(nextButton().hasAttribute("disabled")).toBe(false);
  });
});

describe("DataTablePagination past the end", () => {
  test("a one-page result offers its only page", () => {
    expect(offsetRequestedBy("1", { totalCount: 3, limit: 24, offset: 96 })).toBe(0);
  });

  test("an empty result offers page 1", () => {
    expect(offsetRequestedBy("1", { totalCount: 0, limit: 24, offset: 96 })).toBe(0);
  });

  test("previous goes to the last page with rows", () => {
    expect(
      offsetRequestedBy("Go to previous page", { totalCount: 100, limit: 24, offset: 24 * 9 }),
    ).toBe(96);
  });

  test("a one-page result on its own page shows no page controls", () => {
    render(<DataTablePagination totalCount={3} limit={24} offset={0} onOffsetChange={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
