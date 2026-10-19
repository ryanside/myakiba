import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { functionalUpdate, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { DataGridProvider } from "./data-grid";
import { DataGridPagination } from "./data-grid-pagination";

afterEach(cleanup);

function Pager({
  recordCount,
  pageIndex,
  offset,
  onPageIndexChange,
}: {
  recordCount: number;
  pageIndex: number;
  offset?: number;
  onPageIndexChange?: (pageIndex: number) => void;
}) {
  const pagination = { pageIndex, pageSize: 10 };
  const table = useReactTable<{ id: string }>({
    data: [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(recordCount / 10),
    state: { pagination },
    onPaginationChange: (updater) =>
      onPageIndexChange?.(functionalUpdate(updater, pagination).pageIndex),
  });
  return (
    <DataGridProvider table={table} recordCount={recordCount}>
      <DataGridPagination offset={offset} />
    </DataGridProvider>
  );
}

function pageRequestedBy(
  button: string,
  props: { recordCount: number; pageIndex: number; offset?: number },
) {
  let requested: number | undefined;
  render(<Pager {...props} onPageIndexChange={(pageIndex) => (requested = pageIndex)} />);
  fireEvent.click(screen.getByRole("button", { name: button }));
  return requested;
}

describe("DataGridPagination range", () => {
  test("a page with rows shows the rows it holds", () => {
    render(<Pager recordCount={50} pageIndex={4} />);
    expect(screen.getByText("41 - 50 of 50")).toBeTruthy();
  });

  test("a page past the end shows no rows of the total", () => {
    render(<Pager recordCount={50} pageIndex={10} />);
    expect(screen.getByText("0 of 50")).toBeTruthy();
  });

  test("an empty result shows no rows of none", () => {
    render(<Pager recordCount={0} pageIndex={0} />);
    expect(screen.getByText("0 of 0")).toBeTruthy();
  });
});

describe("DataGridPagination past the end", () => {
  test("a one-page result offers its only page", () => {
    expect(pageRequestedBy("1", { recordCount: 3, pageIndex: 10 })).toBe(0);
  });

  test("an empty result offers page 1", () => {
    expect(pageRequestedBy("1", { recordCount: 0, pageIndex: 10 })).toBe(0);
  });

  test("a longer result offers its last page", () => {
    expect(pageRequestedBy("5", { recordCount: 50, pageIndex: 10 })).toBe(4);
  });

  test("previous goes to the last page with rows", () => {
    expect(pageRequestedBy("Go to previous page", { recordCount: 50, pageIndex: 10 })).toBe(4);
  });

  test("a one-page result on its own page shows no page controls", () => {
    render(<Pager recordCount={3} pageIndex={0} />);
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Go to previous page" })).toBeNull();
  });
});

describe("DataGridPagination at an offset that is not a page start", () => {
  test("an offset past the rows of the only page offers page 1, not marked current", () => {
    expect(pageRequestedBy("1", { recordCount: 3, pageIndex: 0, offset: 5 })).toBe(0);
    expect(screen.getByRole("button", { name: "1" }).className).not.toContain("bg-accent");
  });

  test("an empty result at an offset inside page 1 offers page 1", () => {
    expect(pageRequestedBy("1", { recordCount: 0, pageIndex: 0, offset: 5 })).toBe(0);
  });

  test("previous from an offset past the rows of page 1 goes to page 1", () => {
    expect(
      pageRequestedBy("Go to previous page", { recordCount: 3, pageIndex: 0, offset: 5 }),
    ).toBe(0);
  });

  test("an offset past the rows of the only page shows no rows of the total", () => {
    render(<Pager recordCount={7} pageIndex={0} offset={10} />);
    expect(screen.getByText("0 of 7")).toBeTruthy();
  });

  test("an offset inside the rows names the rows from that offset", () => {
    render(<Pager recordCount={50} pageIndex={1} offset={15} />);
    expect(screen.getByText("16 - 25 of 50")).toBeTruthy();
  });
});
