import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { compile } from "tailwindcss";
import { DataGrid, NUMERIC_COLUMN_META } from "./data-grid";
import { DataGridColumnHeader } from "./data-grid-column-header";
import { DataGridTable } from "./data-grid-table";

const utilities = await compile("@tailwind utilities;");

afterEach(cleanup);

type Item = { name: string; price: number };

const columns: ColumnDef<Item>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataGridColumnHeader title="Name" visibility column={column} />,
  },
  {
    accessorKey: "price",
    header: ({ column }) => <DataGridColumnHeader title="Price" visibility column={column} />,
    meta: NUMERIC_COLUMN_META,
  },
];

function ResizableGrid() {
  const table = useReactTable({
    data: [{ name: "Figure", price: 100 }],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <DataGrid
      table={table}
      recordCount={1}
      tableLayout={{ columnsResizable: true, columnsVisibility: true }}
    >
      <DataGridTable />
    </DataGrid>
  );
}

function renderGridWithStyles() {
  const { container } = render(<ResizableGrid />);
  const candidates = [...container.querySelectorAll("[class]")].flatMap((element) => [
    ...element.classList,
  ]);
  const style = document.createElement("style");
  style.textContent = utilities.build(candidates);
  container.append(style);
}

test("numeric and text columns keep the resize line centered on the handle", () => {
  renderGridWithStyles();
  for (const name of ["Name", "Price"]) {
    const header = screen.getByRole("columnheader", { name });
    const handle = header.querySelector(".cursor-col-resize");
    if (!handle) throw new Error(`Missing resize handle for ${name}`);
    expect(getComputedStyle(handle).justifyContent).toBe("center");
  }
});

test("numeric header labels stay right aligned and text labels keep their alignment", () => {
  renderGridWithStyles();
  for (const [name, alignment] of [
    ["Name", "space-between"],
    ["Price", "flex-end"],
  ] as const) {
    const header = screen.getByRole("columnheader", { name });
    const label = header.querySelector("div:not(.cursor-col-resize)");
    if (!label) throw new Error(`Missing label for ${name}`);
    expect(getComputedStyle(label).justifyContent).toBe(alignment);
  }
});
