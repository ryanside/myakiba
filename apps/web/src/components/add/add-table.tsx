import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ExpandIcon } from "@/lib/icons";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type {
  CellContext,
  ColumnDef,
  ColumnSizingState,
  RowModel,
  SortingState,
  Table,
} from "@tanstack/react-table";
import { createContext, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, MouseEvent, ReactNode, RefObject } from "react";
import { ItemTitleCell } from "@/components/cells/item-title-cell";
import { SelectionCell, SelectionCheckbox } from "@/components/cells/selection-cell";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridExpandedPanel, DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { PickRow } from "@/data/picks";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import type { DraftRow } from "./add-draft";
import { removeButtonId } from "./commit-input";
import type { AddItem } from "./commit-input";
import { onTableKeys, revealFocus } from "./add-table-keys";
import { useColumnsFade } from "./destination-motion";
import { EmptyState } from "./empty-state";
import { FillMenu } from "./fill-menu";
import { PickStatus } from "./pick-status";
import { SearchRow } from "./search-row";
import {
  FIELD,
  FieldGroup,
  FRAME_WIDTH,
  fieldsFor,
  plannedPrice,
  ROW_CONTENT,
  RowField,
  THUMBNAIL,
} from "./row-fields";
import type { Field } from "./row-fields";
import { ReleaseField } from "./row-release";

type ItemRow = {
  readonly kind: "item";
  readonly id: string;
  readonly row: DraftRow;
  readonly item: AddItem;
  readonly release: AddItem["latestRelease"];
  /** What its sortable columns sort by, which a blank field takes from its default. */
  readonly price: number | undefined;
  readonly count: number;
  readonly condition: string;
};

/** What one line of the table holds. Only an `item` has fields, so only it can be selected. */
type AddRow =
  | ItemRow
  | { readonly kind: "loading"; readonly id: string; readonly selected: boolean }
  | {
      readonly kind: "missing";
      readonly id: string;
      readonly lookup: Exclude<AddController["lookup"], "loading">;
    }
  | { readonly kind: "pick"; readonly id: string; readonly pick: PickRow };

const isSelected = (row: AddRow): boolean =>
  row.kind === "item" ? row.row.selected : row.kind === "loading" && row.selected;

function tableRows(c: AddController): AddRow[] {
  const form = c.resolvedForm;
  const shared = form.kind === "collection" ? form.shared : null;
  if (c.awaitingPicks) return [{ kind: "loading", id: "awaiting-picks", selected: false }];
  const picks = c.picks.map((pick): AddRow => ({
    kind: "pick",
    id: `pick-${pick.mfcItemId}`,
    pick,
  }));
  const rows = c.rows.map((row): AddRow => {
    const item = c.items.get(row.itemId);
    if (item) {
      const release = c.releaseOf(row, item);
      return {
        kind: "item",
        id: row.itemId,
        row,
        item,
        release,
        price: plannedPrice(row, release, c.currency) ?? undefined,
        count: row.overrides.count ?? shared?.count ?? 1,
        condition: row.overrides.condition ?? shared?.condition ?? "New",
      };
    }
    return c.lookup === "loading"
      ? { kind: "loading", id: row.itemId, selected: row.selected }
      : { kind: "missing", id: row.itemId, lookup: c.lookup };
  });
  // Picks go last, where a saved one's row lands, so saving one moves no other row.
  return [...rows, ...picks];
}

type AddTableState = {
  readonly c: AddController;
  /** Details exist only where the rows become something the user owns. */
  readonly owned: boolean;
  readonly openRows: ReadonlySet<string>;
  readonly toggleDetails: (itemId: string) => void;
  /** What Fill all can fill, which is nothing where a row has no fields to fill. */
  readonly fields: readonly Field[];
  readonly fieldsHidden: boolean;
};

// Columns are constants that read this, as a column array rebuilt per render would give every cell a
// new component type, which remounts it and takes focus from the input on every keystroke.
const AddTableContext = createContext<AddTableState | null>(null);

function useAddTable(): AddTableState {
  const state = useContext(AddTableContext);
  if (state === null) throw new Error("A cell of the Add table rendered outside of it");
  return state;
}

/** A click on the row itself: not on a control, not in a popup it opened, not ending a selection. */
function isEmptySpace(event: MouseEvent<HTMLTableRowElement>): boolean {
  const target = event.target as Element;
  return (
    event.currentTarget.contains(target) &&
    target.closest(
      "a, button, input, label, [role='checkbox'], [role='combobox'], [data-col='select']",
    ) === null &&
    !window.getSelection()?.toString()
  );
}

/**
 * Sorts when the sort or the set of rows changes, and not on an edit, or the row being typed in
 * would move away from the caret. A row with no fields has nothing to sort by, so it stays on top.
 */
function heldSortedRowModel(table: Table<AddRow>): () => RowModel<AddRow> {
  const sorted = getSortedRowModel<AddRow>()(table);
  let held: { readonly key: string; readonly order: readonly string[] } | null = null;
  return () => {
    const model = sorted();
    const { sorting } = table.getState();
    if (sorting.length === 0) {
      held = null;
      return model;
    }
    const key = JSON.stringify([
      sorting,
      model.rows.map(({ id, original }) => `${id} ${original.kind}`).toSorted(),
    ]);
    if (held?.key !== key) {
      const hasFields = ({ original }: (typeof model.rows)[number]) =>
        original.kind === "item" || original.kind === "loading";
      held = {
        key,
        order: [
          ...model.rows.filter((row) => !hasFields(row)),
          ...model.rows.filter(hasFields),
        ].map(({ id }) => id),
      };
    }
    const byId = new Map(model.rows.map((row) => [row.id, row]));
    const rows = held.order.flatMap((id) => byId.get(id) ?? []);
    return { ...model, rows, flatRows: rows };
  };
}

/** A cell an `item` row fills in, and every other row holds its column's skeleton in. */
function itemCell(Cell: ComponentType<{ readonly row: ItemRow }>) {
  return ({ row, column }: CellContext<AddRow, unknown>) =>
    row.original.kind === "item" ? <Cell row={row.original} /> : column.columnDef.meta?.skeleton;
}

function fieldCell(field: Field) {
  return itemCell(({ row: { row, item, release } }) => {
    const { c } = useAddTable();
    return (
      <RowField field={field} row={row} item={item} release={release} c={c} issues={c.issues} />
    );
  });
}

function SelectAll() {
  const { c } = useAddTable();
  const total = c.countedRows.length;
  const selected = c.countedRows.filter((row) => row.selected).length;
  return (
    <SelectionCheckbox
      label="Select all items"
      checked={total > 0 && selected === total}
      indeterminate={selected > 0 && selected < total}
      disabled={total === 0}
      onCheckedChange={(checked) => c.selectAll(checked)}
    />
  );
}

function SelectRow({ row }: CellContext<AddRow, unknown>) {
  const { c } = useAddTable();
  const { original } = row;
  return (
    <SelectionCell selected={row.getIsSelected()}>
      {original.kind === "item" ? (
        <SelectionCheckbox
          label={`Select ${original.item.title}`}
          checked={original.row.selected}
          onCheckedChange={(checked) => c.select(original.id, checked)}
        />
      ) : (
        <Skeleton className="size-4 rounded-xs" />
      )}
    </SelectionCell>
  );
}

function ItemName({ row: { id, item } }: { readonly row: ItemRow }) {
  return (
    <ItemTitleCell
      itemId={id}
      title={item.title}
      externalId={item.externalId}
      image={item.image}
      walkedByKeys
    />
  );
}

function RowActions({ row: { id, item } }: { readonly row: ItemRow }) {
  const { c, owned, openRows, toggleDetails, fieldsHidden } = useAddTable();
  const open = owned && openRows.has(id);
  return (
    <div className="flex items-center justify-end gap-0.5">
      {fieldsHidden ? null : (
        <Button
          type="button"
          variant="ghost"
          disabled={!owned}
          title={owned ? undefined : "Choose where these go to add details"}
          aria-label={`Details for ${item.title}`}
          aria-expanded={open}
          aria-controls={open ? detailsPanelId(id) : undefined}
          onClick={() => toggleDetails(id)}
        >
          Details
          <HugeiconsIcon
            icon={ExpandIcon}
            data-icon="inline-end"
            className={cn("collapse-chevron", open && "rotate-90")}
            aria-hidden="true"
          />
        </Button>
      )}
      <Button
        type="button"
        id={removeButtonId(id)}
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${item.title}`}
        className="text-muted-foreground"
        onClick={() => c.handleRemove(id)}
      >
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
      </Button>
    </div>
  );
}

const detailsPanelId = (itemId: string) => `add-details-${itemId}`;

/** Everything the row can hold that has no column: one layout, whatever the destination. */
function DetailsPanel({ row: { id, row, item, release } }: { readonly row: ItemRow }) {
  const { c } = useAddTable();
  const shared = { row, item, release, c, issues: c.issues };
  const isCollection = c.resolvedForm.kind === "collection";
  return (
    <DataGridExpandedPanel
      id={detailsPanelId(id)}
      role="group"
      aria-label={`Details for ${item.title}`}
      className={cn(FRAME_WIDTH, "grid gap-3 space-y-0")}
    >
      <FieldGroup title="Purchase" className="@4xl:grid-cols-4">
        <div className="col-span-full min-w-0">
          <ReleaseField row={row} item={item} release={release} c={c} />
        </div>
        {isCollection ? (
          <>
            <div className="@4xl:col-span-2">
              <RowField field={FIELD.shop} {...shared} />
            </div>
            <div className="@4xl:col-span-2">
              <RowField field={FIELD.shipping} {...shared} />
            </div>
          </>
        ) : null}
      </FieldGroup>
      {isCollection ? (
        <FieldGroup title="Dates" className="@4xl:grid-cols-4">
          <RowField field={FIELD.orderDate} {...shared} />
          <RowField field={FIELD.paymentDate} {...shared} />
          <RowField field={FIELD.shippingDate} {...shared} />
          <RowField field={FIELD.collectionDate} {...shared} />
        </FieldGroup>
      ) : null}
      <FieldGroup title="Your notes" className="@4xl:grid-cols-4">
        <div className="col-span-2">
          <RowField field={FIELD.score} {...shared} />
        </div>
        <div className="col-span-2">
          <RowField field={FIELD.tags} {...shared} />
        </div>
        <div className="col-span-full">
          <RowField field={FIELD.notes} {...shared} />
        </div>
      </FieldGroup>
    </DataGridExpandedPanel>
  );
}

// Its content starts under the Item column's, so a row keeps its place when it becomes an Item.
const FRAME_WIDTH_IN_CELL = "sticky start-2 w-[calc(100cqw-1rem-2px)] ps-8.5";

function MissingRow({
  id,
  lookup,
}: {
  readonly id: string;
  readonly lookup: Exclude<AddController["lookup"], "loading">;
}) {
  const { c } = useAddTable();
  return (
    <div className={cn(FRAME_WIDTH_IN_CELL, ROW_CONTENT, "flex items-center gap-3")}>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        {lookup === "failed" ? "Could not load this item" : "No longer in myakiba"}
      </p>
      <Button
        type="button"
        id={removeButtonId(id)}
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        aria-label="Remove this row"
        onClick={() => c.handleRemove(id)}
      >
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
      </Button>
    </div>
  );
}

function PickLine({ pick }: { readonly pick: PickRow }) {
  const { c } = useAddTable();
  return (
    <div className={FRAME_WIDTH_IN_CELL}>
      <PickStatus pick={pick} onRetry={c.handleRetryPick} onDiscard={c.handleDiscardPick} />
    </div>
  );
}

/** Fill all heads the column of row actions. */
function ActionsHeader() {
  const { c, fields, fieldsHidden } = useAddTable();
  return (
    <>
      <span className="sr-only">Actions</span>
      {fieldsHidden ? null : (
        <div className="flex justify-end">
          <FillMenu fields={fields} c={c} onFilled={c.handleAnnounce} />
        </div>
      )}
    </>
  );
}

function fullWidthRow(row: AddRow): ReactNode {
  if (row.kind === "pick") return <PickLine pick={row.pick} />;
  return row.kind === "missing" ? <MissingRow id={row.id} lookup={row.lookup} /> : null;
}

const FIELD_SKELETON = <Skeleton className="h-6" />;

/** Its lines hold the title's and the MFC number's heights, so a row keeps its height on load. */
const ITEM_SKELETON = (
  <div className="flex items-center gap-3">
    <Skeleton className={THUMBNAIL} />
    <div className="min-w-0 flex-1 space-y-px">
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-3/4" />
      </div>
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  </div>
);

/** What takes focus in a column that scrolls stops clear of the pinned row actions. */
const CLEARS_ACTIONS = "**:scroll-me-34";

const COLUMNS: ColumnDef<AddRow>[] = [
  {
    id: "select",
    header: SelectAll,
    cell: SelectRow,
    size: 32,
    enableSorting: false,
    enableResizing: false,
  },
  {
    id: "item",
    accessorFn: (row) => (row.kind === "item" ? row.item.title : undefined),
    header: ({ column }) => <DataGridColumnHeader title="Item" column={column} />,
    cell: itemCell(ItemName),
    sortingFn: "text",
    size: 416,
    minSize: 200,
    meta: {
      skeleton: ITEM_SKELETON,
      cellClassName: CLEARS_ACTIONS,
      expandedContent: (row) => (row.kind === "item" ? <DetailsPanel row={row} /> : null),
    },
  },
  {
    id: "price",
    accessorFn: (row) => (row.kind === "item" ? row.price : undefined),
    header: ({ column }) => <DataGridColumnHeader title="Price" column={column} />,
    cell: fieldCell(FIELD.price),
    sortingFn: "basic",
    size: 144,
    minSize: 96,
    meta: { skeleton: FIELD_SKELETON, cellClassName: CLEARS_ACTIONS },
  },
  {
    id: "count",
    accessorFn: (row) => (row.kind === "item" ? row.count : undefined),
    header: ({ column }) => <DataGridColumnHeader title="Count" column={column} />,
    cell: fieldCell(FIELD.count),
    sortingFn: "basic",
    size: 80,
    minSize: 64,
    meta: { skeleton: FIELD_SKELETON, cellClassName: CLEARS_ACTIONS },
  },
  {
    id: "condition",
    accessorFn: (row) => (row.kind === "item" ? row.condition : undefined),
    header: ({ column }) => <DataGridColumnHeader title="Condition" column={column} />,
    cell: fieldCell(FIELD.condition),
    sortingFn: "text",
    size: 144,
    minSize: 112,
    meta: { skeleton: FIELD_SKELETON, cellClassName: CLEARS_ACTIONS },
  },
  {
    id: "actions",
    header: ActionsHeader,
    cell: itemCell(RowActions),
    size: 136,
    enableSorting: false,
    enableResizing: false,
    enablePinning: true,
    meta: {
      skeleton: <Skeleton className="ms-auto h-6 w-24" />,
      // Solid, as a title passing under Details would read through the grid's translucent pin.
      cellClassName: "data-pinned:bg-background!",
    },
  },
];

const HIDDEN_WITHOUT_FIELDS = { price: false, count: false, condition: false };
const SHOW_ALL = {};
const PINNED = { right: ["actions"] };
const FRAME_BORDERS = 2;

function useFrameWidth(frame: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [frame]);
  return width;
}

function useAddTableState(c: AddController): AddTableState {
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set());
  const { kind } = c.resolvedForm;
  return {
    c,
    owned: kind === "collection" || kind === "order",
    openRows,
    toggleDetails: (itemId) => {
      setOpenRows((current) => {
        const next = new Set(current);
        if (!next.delete(itemId)) next.add(itemId);
        return next;
      });
    },
    fields: fieldsFor(kind),
    fieldsHidden: kind === "none",
  };
}

/** Every row, under a header that holds Fill all. */
export function AddItems({ controller: c }: { readonly controller: AddController }) {
  const hintId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const frameWidth = useFrameWidth(frame);
  const tableState = useAddTableState(c);
  const { owned, openRows, fieldsHidden } = tableState;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  useColumnsFade(frame, fieldsHidden);
  // What was sized or sorted for other columns says nothing about these, and could sort by something
  // no longer on screen.
  const [columnsFor, setColumnsFor] = useState(fieldsHidden);
  if (columnsFor !== fieldsHidden) {
    setColumnsFor(fieldsHidden);
    setColumnSizing({});
    if (fieldsHidden)
      setSorting((current) => current.filter(({ id }) => !(id in HIDDEN_WITHOUT_FIELDS)));
  }
  const data = tableRows(c);

  const table = useReactTable<AddRow>({
    columns: COLUMNS,
    data,
    getRowId: (row) => row.id,
    defaultColumn: { enablePinning: false },
    enableRowSelection: true,
    state: {
      sorting,
      columnSizing,
      columnPinning: PINNED,
      columnVisibility: fieldsHidden ? HIDDEN_WITHOUT_FIELDS : SHOW_ALL,
      // A loading row has its tint from the first paint too, since the draft already knows.
      rowSelection: Object.fromEntries(
        data.flatMap((row) => (isSelected(row) ? [[row.id, true]] : [])),
      ),
      expanded: Object.fromEntries(
        data.flatMap(({ id }) => (owned && openRows.has(id) ? [[id, true]] : [])),
      ),
    },
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    // The rows are new on every render, and resetting on that would render forever.
    autoResetAll: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: heldSortedRowModel,
  });

  return (
    <AddTableContext value={tableState}>
      <div
        ref={frame}
        role="presentation"
        className="@container/grid"
        onKeyDownCapture={onTableKeys}
        onFocusCapture={revealFocus}
      >
        <p id={hintId} className="sr-only">
          Arrow keys move between cells, Enter moves on, Space opens a menu.
        </p>
        <DataGrid
          table={table}
          recordCount={data.length}
          tableAria={{ "aria-label": "Items to add", "aria-describedby": hintId }}
          emptyMessage={<EmptyState />}
          fullWidthRow={fullWidthRow}
          onRowPointerClick={(row, event) => {
            if (owned && row.kind === "item" && isEmptySpace(event)) {
              tableState.toggleDetails(row.id);
            }
          }}
          tableLayout={{
            dense: true,
            columnsResizable: true,
            // Only when columns can pass under it does the pin show, so at rest it is any other cell.
            columnsPinnable: table.getTotalSize() > frameWidth - FRAME_BORDERS,
          }}
          tableClassNames={{
            // Rows are there from the first paint, so an entrance would only move them on load.
            bodyRow: cn("animate-none", owned && "cursor-pointer"),
            // An empty page keeps its header's look, with only the searches and its one action working.
            header: cn(data.length === 0 && "pointer-events-none"),
          }}
        >
          <DataGridContainer>
            <ScrollArea horizontal>
              <DataGridTable />
            </ScrollArea>
            <SearchRow controller={c} />
          </DataGridContainer>
        </DataGrid>
      </div>
    </AddTableContext>
  );
}
