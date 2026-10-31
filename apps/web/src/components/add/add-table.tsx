import { ArrowDown01Icon, Cancel01Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import { Link } from "@tanstack/react-router";
import {
  functionalUpdate,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  CellContext,
  ColumnDef,
  ColumnSizingState,
  RowModel,
  SortingState,
  Table,
  Updater,
} from "@tanstack/react-table";
import { createContext, useContext, useId, useMemo, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { DataGrid, DataGridContainer } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridExpandedPanel, DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { PickRow } from "@/data/picks";
import { itemDestination } from "@/lib/item-destination";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import type { DraftRow } from "./add-draft";
import { EmptyState } from "./add-notices";
import { AddSearch } from "./add-search";
import { removeButtonId } from "./commit-input";
import type { AddItem } from "./commit-input";
import { FillMenu } from "./fill-menu";
import { PickStatus } from "./pick-status";
import { FIELD, FieldGroup, fieldsFor, plannedPrice, RowField, THUMBNAIL } from "./row-fields";
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
  | { readonly kind: "loading"; readonly id: string; readonly row: DraftRow }
  | {
      readonly kind: "missing";
      readonly id: string;
      readonly lookup: Exclude<AddController["lookup"], "loading">;
    }
  | { readonly kind: "pick"; readonly id: string; readonly pick: PickRow };

function tableRows(c: AddController): AddRow[] {
  const form = c.resolvedForm;
  const shared = form.kind === "collection" ? form.shared : null;
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
      ? { kind: "loading", id: row.itemId, row }
      : { kind: "missing", id: row.itemId, lookup: c.lookup };
  });
  return [...picks, ...rows];
}

type AddTableState = {
  readonly c: AddController;
  /** Details exist only where the rows become something the user owns. */
  readonly owned: boolean;
  readonly openRows: ReadonlySet<string>;
  readonly toggleDetails: (itemId: string) => void;
};

// Columns are constants that read this, as a column array rebuilt per render would give every cell a
// new component type, which remounts it and takes focus from the input on every keystroke.
const AddTableContext = createContext<AddTableState | null>(null);

function useAddTable(): AddTableState {
  const state = useContext(AddTableContext);
  if (state === null) throw new Error("A cell of the Add table rendered outside of it");
  return state;
}

const EDITABLE_CELLS = '[data-col="price"], [data-col="count"], [data-col="condition"]';

const isVisible = (element: HTMLElement) => element.checkVisibility();

function focusablesIn(root: Element): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>("a[href], button, input, [role='checkbox']"),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true" &&
      isVisible(element),
  );
}

function focusCell(element: HTMLElement | undefined) {
  if (!element) return;
  element.focus();
  // Focus alone scrolls only a fully hidden element, and the sticky header can cover part of one.
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (element instanceof HTMLInputElement) element.select();
}

function isTextEntry(element: HTMLElement): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type !== "checkbox";
}

/** Left and Right belong to the caret until it reaches the end of the text. */
function caretAtEdge(input: HTMLInputElement, key: "ArrowLeft" | "ArrowRight"): boolean {
  const { selectionStart, selectionEnd, value } = input;
  // A number input has no selection API, and its values are short.
  if (selectionStart === null || selectionEnd === null) return true;
  if (selectionStart !== selectionEnd) return true;
  return key === "ArrowLeft" ? selectionStart === 0 : selectionEnd === value.length;
}

function nextDataCell(from: HTMLElement): HTMLElement | undefined {
  const row = from.closest("tr");
  const cell = from.closest(EDITABLE_CELLS);
  if (!row || !cell) return undefined;
  const inRow = [...row.querySelectorAll<HTMLElement>(EDITABLE_CELLS)];
  const later = inRow.slice(inRow.indexOf(cell as HTMLElement) + 1);
  for (const candidate of later) {
    const [first] = focusablesIn(candidate);
    if (first) return first;
  }
  const rows = [...(row.parentElement?.querySelectorAll("tr[data-row]") ?? [])];
  for (const candidate of rows.slice(rows.indexOf(row) + 1)) {
    for (const nextCell of candidate.querySelectorAll<HTMLElement>(EDITABLE_CELLS)) {
      const [first] = focusablesIn(nextCell);
      if (first) return first;
    }
  }
  return undefined;
}

/**
 * Spreadsheet keys over a real table. Left and Right walk the row's controls, Up and Down keep the
 * column, Enter moves on from an input or a closed select. Keys pressed in a portaled popup bubble
 * here through React but are not inside the table, so they stay the popup's.
 */
function onTableKeys(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const grid = event.currentTarget;
  const target = event.target as HTMLElement;
  if (!grid.contains(target)) return;
  const row = target.closest<HTMLElement>("tr[data-row]");
  if (!row) return;

  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  switch (event.key) {
    case "ArrowLeft":
    case "ArrowRight": {
      if (isTextEntry(target) && !caretAtEdge(target, event.key)) return;
      stop();
      const inRow = focusablesIn(row);
      const step = event.key === "ArrowLeft" ? -1 : 1;
      focusCell(inRow[inRow.indexOf(target) + step]);
      return;
    }
    case "ArrowUp":
    case "ArrowDown": {
      stop();
      const column = target.closest<HTMLElement>("[data-col]")?.dataset.col;
      if (column === undefined) return;
      const rows = [...grid.querySelectorAll<HTMLElement>("tr[data-row]")];
      const step = event.key === "ArrowUp" ? -1 : 1;
      for (let index = rows.indexOf(row) + step; rows[index]; index += step) {
        const cell = rows[index]?.querySelector(`[data-col="${column}"]`);
        const [first] = cell ? focusablesIn(cell) : [];
        if (first) {
          focusCell(first);
          return;
        }
      }
      return;
    }
    case "Enter": {
      const moves =
        isTextEntry(target) ||
        (target.getAttribute("role") === "combobox" &&
          target.getAttribute("aria-expanded") !== "true");
      if (!moves || !target.closest(EDITABLE_CELLS)) return;
      stop();
      focusCell(nextDataCell(target));
    }
  }
}

/** A click on the row itself: not on a control, not in a popup it opened, not ending a selection. */
function isEmptySpace(event: MouseEvent<HTMLTableRowElement>): boolean {
  const target = event.target as Element;
  return (
    event.currentTarget.contains(target) &&
    target.closest("a, button, input, label, [role='checkbox'], [role='combobox']") === null &&
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
  return (
    <Checkbox
      aria-label="Select all items"
      checked={total > 0 && c.selectedCount === total}
      indeterminate={c.selectedCount > 0 && c.selectedCount < total}
      disabled={total === 0}
      onCheckedChange={(checked) => c.selectAll(checked === true)}
      className="align-[inherit] mb-0.5 rounded-xs"
    />
  );
}

function SelectRow({ row }: CellContext<AddRow, unknown>) {
  const { c } = useAddTable();
  const { original } = row;
  return (
    <>
      <div
        className={cn(
          "hidden absolute top-0 bottom-0 start-0 w-[2px] bg-primary",
          row.getIsSelected() && "block",
        )}
      />
      {original.kind === "item" ? (
        <Checkbox
          aria-label={`Select ${original.item.title}`}
          checked={original.row.selected}
          onCheckedChange={(checked) => c.select(original.id, checked === true)}
          className="align-[inherit] mb-0.5 rounded-xs"
        />
      ) : (
        <Skeleton className="size-4 rounded-xs" />
      )}
    </>
  );
}

function ItemName({ row: { id, item } }: { readonly row: ItemRow }) {
  const { title, externalId, image } = item;
  return (
    <div className="flex items-center gap-3">
      <Link
        {...itemDestination(id, externalId)}
        className="shrink-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        tabIndex={-1}
        aria-hidden="true"
      >
        <ImageThumbnail
          images={image ? [image] : []}
          title={title}
          decorative
          className={THUMBNAIL}
          fallbackIcon={<HugeiconsIcon icon={PackageIcon} className="size-4" aria-hidden="true" />}
        />
      </Link>
      <div className="min-w-0 flex-1 space-y-px">
        <Link
          {...itemDestination(id, externalId)}
          title={title}
          className="block w-fit max-w-full truncate rounded-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {title}
        </Link>
        <div className="flex items-center gap-2 font-normal">
          {externalId === null ? (
            <span className="text-xs text-muted-foreground">Custom item</span>
          ) : (
            <a
              href={mfcItemUrl(externalId)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-xs text-muted-foreground tabular-nums outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              MFC #{externalId}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function RowActions({ row: { id, item } }: { readonly row: ItemRow }) {
  const { c, owned, openRows, toggleDetails } = useAddTable();
  const open = owned && openRows.has(id);
  return (
    <div className="flex items-center justify-end gap-0.5">
      {c.resolvedForm.kind === "none" ? null : (
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
            icon={ArrowDown01Icon}
            data-icon="inline-end"
            className={cn(
              "transition-transform duration-150 ease-out motion-reduce:transition-none",
              open && "rotate-180",
            )}
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

// A wide table scrolls sideways inside its frame, and what spans it stays in view. 100cqw is the
// frame with its 1px borders, which this is inside of.
const FRAME_WIDTH = "sticky start-0 w-[calc(100cqw-2px)]";
const FRAME_WIDTH_IN_CELL = "sticky start-2 w-[calc(100cqw-1rem-2px)]";

function MissingRow({
  id,
  lookup,
}: {
  readonly id: string;
  readonly lookup: Exclude<AddController["lookup"], "loading">;
}) {
  const { c } = useAddTable();
  return (
    <div className={cn(FRAME_WIDTH_IN_CELL, "flex items-center gap-3")}>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        {lookup === "failed" ? "Could not load this item" : "No longer in the item database"}
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
    size: 480,
    minSize: 200,
    meta: {
      skeleton: ITEM_SKELETON,
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
    meta: { skeleton: FIELD_SKELETON },
  },
  {
    id: "count",
    accessorFn: (row) => (row.kind === "item" ? row.count : undefined),
    header: ({ column }) => <DataGridColumnHeader title="Count" column={column} />,
    cell: fieldCell(FIELD.count),
    sortingFn: "basic",
    size: 80,
    minSize: 64,
    meta: { skeleton: FIELD_SKELETON },
  },
  {
    id: "condition",
    accessorFn: (row) => (row.kind === "item" ? row.condition : undefined),
    header: ({ column }) => <DataGridColumnHeader title="Condition" column={column} />,
    cell: fieldCell(FIELD.condition),
    sortingFn: "text",
    size: 144,
    minSize: 112,
    meta: { skeleton: FIELD_SKELETON },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: itemCell(RowActions),
    size: 136,
    enableSorting: false,
    enableResizing: false,
    meta: { skeleton: <Skeleton className="ms-auto h-6 w-24" /> },
  },
];

const HIDDEN_WITHOUT_OWNERSHIP = { price: false, count: false, condition: false };
const SHOW_ALL = {};

// A frame this wide holds every column unless the user resizes them past it, so it can clip and let
// the header stick to the window. A narrower one scrolls sideways, as a sticky header cannot.
const SCROLLS_BELOW = 1024;

/** The toolbar and every row. The search lives here so it lines up with what it adds to. */
export function AddItems({
  controller: c,
  onAnnounce,
}: {
  readonly controller: AddController;
  readonly onAnnounce: (message: string) => void;
}) {
  const hintId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set());
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const { kind } = c.resolvedForm;
  const owned = kind === "collection" || kind === "order";
  const fields = fieldsFor(kind);
  const data = tableRows(c);

  const tableState = useMemo(
    () => ({
      c,
      owned,
      openRows,
      toggleDetails: (itemId: string) => {
        setOpenRows((current) => {
          const next = new Set(current);
          if (!next.delete(itemId)) next.add(itemId);
          return next;
        });
      },
    }),
    [c, owned, openRows],
  );

  const table = useReactTable<AddRow>({
    columns: COLUMNS,
    data,
    getRowId: (row) => row.id,
    getRowCanExpand: ({ original }) => original.kind === "item",
    enableRowSelection: ({ original }) => original.kind === "item",
    state: {
      sorting,
      columnSizing,
      columnVisibility: kind === "none" ? HIDDEN_WITHOUT_OWNERSHIP : SHOW_ALL,
      // A loading row has its tint from the first paint too, since the draft already knows.
      rowSelection: Object.fromEntries(
        c.rows.flatMap((row) => (row.selected ? [[row.itemId, true]] : [])),
      ),
      expanded: Object.fromEntries(
        data.flatMap(({ id }) => (owned && openRows.has(id) ? [[id, true]] : [])),
      ),
    },
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    onColumnSizingChange: (updater: Updater<ColumnSizingState>) => {
      setColumnSizing((current) => {
        const next = functionalUpdate(updater, current);
        const width = frame.current?.clientWidth ?? 0;
        const total = table
          .getVisibleLeafColumns()
          .reduce((sum, column) => sum + (next[column.id] ?? column.columnDef.size ?? 0), 0);
        return width >= SCROLLS_BELOW && total > width ? current : next;
      });
    },
    // The rows are new on every render, and resetting on that would render forever.
    autoResetAll: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: heldSortedRowModel,
  });

  return (
    <>
      <div className="relative z-30 flex items-center gap-2">
        <AddSearch {...c.searchProps} />
        {fields.length > 0 ? <FillMenu fields={fields} c={c} onFilled={onAnnounce} /> : null}
      </div>

      <AddTableContext value={tableState}>
        <div
          ref={frame}
          role="group"
          aria-label="Items to add"
          aria-describedby={hintId}
          className="@container/grid"
          onKeyDownCapture={onTableKeys}
        >
          <p id={hintId} className="sr-only">
            Arrow keys move between cells, Enter moves on, Space opens a menu.
          </p>
          <DataGrid
            table={table}
            recordCount={data.length}
            emptyMessage={<EmptyState />}
            fullWidthRow={fullWidthRow}
            onRowPointerClick={(row, event) => {
              if (owned && row.kind === "item" && isEmptySpace(event)) {
                tableState.toggleDetails(row.id);
              }
            }}
            tableLayout={{ dense: true, headerSticky: true, columnsResizable: true }}
            tableClassNames={{ bodyRow: cn("animate-none", owned && "cursor-pointer") }}
          >
            <DataGridContainer className="@5xl/grid:overflow-clip">
              <ScrollArea
                horizontal
                className="@5xl/grid:overflow-clip @5xl/grid:**:data-[slot=scroll-area-viewport]:overflow-clip!"
              >
                <DataGridTable />
              </ScrollArea>
            </DataGridContainer>
          </DataGrid>
        </div>
      </AddTableContext>
    </>
  );
}
