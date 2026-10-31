import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, DataGridContainer } from "./data-grid";
import { DataGridExpandedPanel, DataGridTable } from "./data-grid-table";

afterEach(cleanup);

type Row = { readonly id: string; readonly wide: boolean };

const COLUMNS: ColumnDef<Row>[] = [
  { id: "first", header: "First", cell: ({ row }) => `first ${row.id}` },
  { id: "second", header: "Second", cell: ({ row }) => `second ${row.id}` },
];

function Grid({ fullWidth }: { readonly fullWidth: boolean }) {
  const data = [
    { id: "wide", wide: true },
    { id: "plain", wide: false },
  ];
  const table = useReactTable({
    columns: COLUMNS,
    data,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <DataGrid
      table={table}
      recordCount={data.length}
      {...(fullWidth ? { fullWidthRow: (row: Row) => (row.wide ? `all of ${row.id}` : null) } : {})}
    >
      <DataGridContainer>
        <DataGridTable />
      </DataGridContainer>
    </DataGrid>
  );
}

test("a full width row spans the columns, and the rest keep their cells", () => {
  render(<Grid fullWidth />);
  const wide = screen.getByRole("cell", { name: "all of wide" });
  expect(wide.getAttribute("colspan")).toBe("2");
  expect(wide.closest("tr")?.dataset.row).toBe("wide");
  expect(screen.getByRole("cell", { name: "first plain" }).dataset.col).toBe("first");
  expect(screen.getByRole("columnheader", { name: "Second" }).dataset.col).toBe("second");
  expect(screen.getByRole("columnheader", { name: "Second" }).closest("tr")?.dataset.row).toBe(
    "head",
  );
});

test("a grid that names no full width row renders every row's cells", () => {
  render(<Grid fullWidth={false} />);
  expect(screen.getByRole("cell", { name: "first wide" })).toBeDefined();
  expect(screen.queryByRole("cell", { name: "all of wide" })).toBeNull();
});

test("the expanded panel keeps a caller's role and label, and keeps clicks from its row", () => {
  let clicks = 0;
  render(
    <div role="presentation" onClick={() => clicks++}>
      <DataGridExpandedPanel role="group" aria-label="More">
        <button type="button">Inside</button>
      </DataGridExpandedPanel>
    </div>,
  );
  screen.getByRole("group", { name: "More" });
  screen.getByRole("button", { name: "Inside" }).click();
  expect(clicks).toBe(0);
});
