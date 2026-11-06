import type { ReactNode } from "react";
import type { CellContext } from "@tanstack/react-table";

type PendingCellRender<TRow> = (
  context: CellContext<TRow, unknown>,
  isPending: boolean,
) => ReactNode;

export type WithPending<TRow> = (
  render: PendingCellRender<TRow>,
) => (context: CellContext<TRow, unknown>) => ReactNode;

// Cells read pending state from context, not from the column defs, so the defs stay stable and
// flexRender keeps each cell mounted while its row saves.
export function withRowPending<TRow>(
  useIsPending: () => (id: string) => boolean,
  idOf: (row: TRow) => string,
): WithPending<TRow> {
  return (render) =>
    function PendingCell(context) {
      const isPending = useIsPending();
      return render(context, isPending(idOf(context.row.original)));
    };
}
