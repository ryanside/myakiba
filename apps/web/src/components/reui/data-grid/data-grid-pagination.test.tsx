import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { DataGridProvider } from "./data-grid";
import { DataGridPagination } from "./data-grid-pagination";

afterEach(cleanup);

function Pager({ recordCount, pageIndex }: { recordCount: number; pageIndex: number }) {
  const table = useReactTable<{ id: string }>({
    data: [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(recordCount / 10),
    state: { pagination: { pageIndex, pageSize: 10 } },
  });
  return (
    <DataGridProvider table={table} recordCount={recordCount}>
      <DataGridPagination />
    </DataGridProvider>
  );
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
