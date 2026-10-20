import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { DataTablePagination } from "./data-table-pagination";

afterEach(cleanup);

const nextButton = () => screen.getByRole("button", { name: "Go to next page" });

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
