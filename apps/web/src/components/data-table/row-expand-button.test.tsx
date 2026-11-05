import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { RowExpandButton } from "./row-expand-button";

afterEach(cleanup);

type Shop = { readonly name: string };

const COLUMNS: ColumnDef<Shop>[] = [
  { id: "expand", cell: ({ row }) => <RowExpandButton row={row} /> },
];

function Table({
  canExpand,
  onRowClick,
}: {
  readonly canExpand: boolean;
  readonly onRowClick: () => void;
}) {
  const table = useReactTable<Shop>({
    data: [{ name: "AmiAmi" }],
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => canExpand,
  });
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} onClick={onRowClick} data-expanded={row.getIsExpanded()}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe("RowExpandButton", () => {
  test("opens and closes its row without clicking the row", async () => {
    let rowClicks = 0;
    render(<Table canExpand onRowClick={() => rowClicks++} />);

    await userEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const collapse = screen.getByRole("button", { name: "Collapse row" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("row").dataset.expanded).toBe("true");

    await userEvent.click(collapse);
    expect(screen.getByRole("button", { name: "Expand row" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(rowClicks).toBe(0);
  });

  test("renders nothing for a row that cannot expand", () => {
    render(<Table canExpand={false} onRowClick={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
