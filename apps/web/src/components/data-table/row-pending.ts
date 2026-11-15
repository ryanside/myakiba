import type { ReactNode } from "react";
import type { CellContext } from "@tanstack/react-table";
import type { Saving } from "@/data/client";

type PendingCellRender<TRow> = (
  context: CellContext<TRow, unknown>,
  isPending: boolean,
) => ReactNode;

type WithPending<TRow> = (
  render: PendingCellRender<TRow>,
) => (context: CellContext<TRow, unknown>) => ReactNode;

// Cells read pending state from context, not from the column defs, so the defs stay stable and
// flexRender keeps each cell mounted while its row saves.
export function withRowPending<TRow, TKey>(
  useIsPending: () => (key: TKey) => boolean,
  keyOf: (row: TRow) => TKey,
): WithPending<TRow> {
  return (render) =>
    function PendingCell(context) {
      const isPending = useIsPending();
      return render(context, isPending(keyOf(context.row.original)));
    };
}

export interface CellEdit<TValue> {
  readonly disabled: boolean;
  readonly onSubmit: (value: TValue) => Saving;
}

export function editableCell<TRow>(
  withPending: WithPending<TRow>,
  save: (row: TRow, field: keyof TRow, value: TRow[keyof TRow]) => Saving,
) {
  return <TField extends keyof TRow>(
    field: TField,
    render: (row: TRow, edit: CellEdit<TRow[TField]>) => ReactNode,
  ) =>
    withPending(({ row }, isPending) =>
      render(row.original, {
        disabled: isPending,
        onSubmit: (value) => save(row.original, field, value),
      }),
    );
}
