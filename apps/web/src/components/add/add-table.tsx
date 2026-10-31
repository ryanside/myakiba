import { ArrowDown01Icon, Cancel01Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
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
import { differingRows, FIELD, FieldGroup, fieldsFor, RowField, THUMBNAIL } from "./row-fields";
import type { Field } from "./row-fields";
import { ReleaseField } from "./row-release";

// The Collection grid's header row. Its tint is a gradient so a sticky cell stays opaque. It sticks
// at -top-1 because the page's scroller has 4px of padding that a sticky inset does not cross.
const HEAD_CELL =
  "h-9 bg-card bg-linear-to-r from-muted/40 to-muted/40 font-normal text-secondary-foreground/80";

const ROW_LINE = "border-t border-border/60 @max-3xl/rows:border-0";

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
  const cell = from.closest("[data-add-cell]");
  if (!row || !cell) return undefined;
  const inRow = [...row.querySelectorAll<HTMLElement>("[data-add-cell]")];
  const later = inRow.slice(inRow.indexOf(cell as HTMLElement) + 1);
  for (const candidate of later) {
    const [first] = focusablesIn(candidate);
    if (first) return first;
  }
  const rows = [...(row.parentElement?.querySelectorAll("tr[data-add-row]") ?? [])];
  for (const candidate of rows.slice(rows.indexOf(row) + 1)) {
    for (const nextCell of candidate.querySelectorAll<HTMLElement>("[data-add-cell]")) {
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
function onTableKeys(event: KeyboardEvent<HTMLTableElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const table = event.currentTarget;
  const target = event.target as HTMLElement;
  if (!table.contains(target)) return;
  const row = target.closest<HTMLElement>("tr[data-add-row]");
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
      const column = target.closest<HTMLElement>("[data-add-col]")?.dataset.addCol;
      if (column === undefined) return;
      const rows = [...table.querySelectorAll<HTMLElement>("tr[data-add-row]")];
      const step = event.key === "ArrowUp" ? -1 : 1;
      for (let index = rows.indexOf(row) + step; rows[index]; index += step) {
        const cell = rows[index]?.querySelector(`[data-add-col="${column}"]`);
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
      if (!moves || !target.closest("[data-add-cell]")) return;
      stop();
      focusCell(nextDataCell(target));
    }
  }
}

/**
 * The search's panel drops from the toolbar, where the page's scroller would cut it or the phone's
 * fixed bar would cover it. So it gets the room below the input, after the page moves the input up
 * when that room is too small.
 */
function useSearchRoom() {
  const [room, setRoom] = useState<number | null>(null);
  const measure = (wrapper: HTMLElement) => {
    const pane = wrapper.closest("[data-add-pane]");
    if (!pane) return;
    const bar = document.querySelector('section[aria-label="Commit"]');
    const paneScrolls = getComputedStyle(pane).overflowY !== "visible";
    const limit = () => {
      if (paneScrolls) return pane.getBoundingClientRect().bottom;
      return bar && getComputedStyle(bar).position === "fixed"
        ? bar.getBoundingClientRect().top
        : window.innerHeight;
    };
    const below = () => limit() - wrapper.getBoundingClientRect().bottom;
    if (below() < 288) wrapper.scrollIntoView({ block: "start" });
    setRoom(Math.max(below() - 8, 160));
  };
  return { room, measure };
}

/** The toolbar and every row. The search lives here so it lines up with what it adds to. */
export function AddItems({
  controller: c,
  onAnnounce,
}: {
  readonly controller: AddController;
  readonly onAnnounce: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const search = useSearchRoom();

  const { kind } = c.resolvedForm;
  const owned = kind === "collection" || kind === "order";
  const fields = fieldsFor(kind);
  const columns = fields.filter((field) => field.width !== undefined);
  const selectable = c.rows.filter((row) => c.items.has(row.itemId));
  const selectedCount = selectable.filter((row) => row.selected).length;
  const span = columns.length + 2;

  const toggleDetails = (itemId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });
  };

  return (
    <div className={cn("flex flex-col gap-2.5", !c.hasRows && "min-h-0 flex-1")}>
      <div className="relative z-30 flex flex-wrap items-center gap-2">
        {/* AddSearch insets its input by 4px, so this puts the input on the table's edge. */}
        <div
          className="-mt-1 -ms-1 w-full min-w-0 scroll-mt-2 @2xl/add:w-xs [&_[role=presentation]]:max-h-(--search-room) @2xl/add:[&_[role=presentation]]:end-auto @2xl/add:[&_[role=presentation]]:w-lg"
          style={
            search.room === null
              ? undefined
              : ({ "--search-room": `${search.room}px` } as CSSProperties)
          }
          onFocus={(event) => search.measure(event.currentTarget)}
          onInput={(event) => search.measure(event.currentTarget)}
        >
          <AddSearch {...c.searchProps} />
        </div>
        {c.rows.length > 0 && fields.length > 0 ? (
          <div className="ms-auto flex items-center gap-2 @max-2xl/add:ms-0 @max-2xl/add:w-full">
            <FillMenu fields={fields} c={c} onFilled={onAnnounce} />
          </div>
        ) : null}
      </div>

      {c.hasRows ? (
        <div className="@container/rows isolate overflow-clip rounded-xl bg-card ring-1 ring-foreground/10">
          <table
            onKeyDownCapture={onTableKeys}
            className="w-full border-separate border-spacing-0 text-sm @max-3xl/rows:block"
          >
            <caption className="sr-only">
              Items to add. Arrow keys move between cells, Enter moves on, Space opens a menu.
            </caption>
            {c.rows.length > 0 ? (
              <thead className="@max-3xl/rows:block">
                <tr
                  data-add-row="head"
                  className="@max-3xl/rows:flex @max-3xl/rows:items-center @max-3xl/rows:bg-muted/40 @max-3xl/rows:px-3 @max-3xl/rows:py-2"
                >
                  <th
                    scope="col"
                    data-add-col="item"
                    className={cn(
                      HEAD_CELL,
                      "z-20 min-w-72 px-3 text-start @3xl/rows:sticky @3xl/rows:-top-1 @4xl/rows:min-w-96 @max-3xl/rows:block @max-3xl/rows:h-auto @max-3xl/rows:min-w-0 @max-3xl/rows:bg-transparent @max-3xl/rows:bg-none @max-3xl/rows:px-0",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Checkbox
                        aria-label="Select all items"
                        checked={selectable.length > 0 && selectedCount === selectable.length}
                        indeterminate={selectedCount > 0 && selectedCount < selectable.length}
                        disabled={selectable.length === 0}
                        onCheckedChange={(checked) => c.selectAll(checked === true)}
                      />
                      <span aria-hidden="true" className="@3xl/rows:hidden">
                        Select all
                      </span>
                      <span className="@max-3xl/rows:hidden">Item</span>
                    </span>
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      data-add-col={column.id}
                      className={cn(
                        HEAD_CELL,
                        "sticky -top-1 z-20 px-4 @max-3xl/rows:hidden",
                        column.numeric ? "text-end" : "text-start",
                        column.width,
                      )}
                    >
                      <span className="block truncate" title={column.label}>
                        {column.label}
                      </span>
                    </th>
                  ))}
                  <th
                    scope="col"
                    data-add-col="actions"
                    className={cn(
                      HEAD_CELL,
                      "z-20 w-24 min-w-24 @3xl/rows:sticky @3xl/rows:-top-1 @max-3xl/rows:hidden",
                    )}
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
            ) : null}
            <tbody className="@max-3xl/rows:block">
              {c.picks.map((pick) => (
                <WideRow key={pick.mfcItemId} span={span}>
                  <PickStatus
                    pick={pick}
                    onRetry={c.handleRetryPick}
                    onDiscard={c.handleDiscardPick}
                  />
                </WideRow>
              ))}
              {c.rows.map((row) => {
                const item = c.items.get(row.itemId);
                if (!item) {
                  if (c.lookup === "loading") {
                    return <LoadingRow key={row.itemId} columns={columns} />;
                  }
                  return (
                    <WideRow key={row.itemId} span={span}>
                      <MissingItemRow
                        itemId={row.itemId}
                        lookup={c.lookup}
                        onRemove={c.handleRemove}
                      />
                    </WideRow>
                  );
                }
                const isOpen = owned && expanded.has(row.itemId);
                const release = c.releaseOf(row, item);
                const detailsId = `add-details-${row.itemId}`;
                return (
                  <Fragment key={row.itemId}>
                    <ItemRow
                      row={row}
                      item={item}
                      release={release}
                      c={c}
                      columns={columns}
                      open={isOpen}
                      detailsId={detailsId}
                      owned={owned}
                      showsDetails={kind !== "none"}
                      onToggleDetails={() => toggleDetails(row.itemId)}
                    />
                    {isOpen ? (
                      <tr id={detailsId} className="@max-3xl/rows:block">
                        <td colSpan={span} className="bg-muted/40 p-0 @max-3xl/rows:block">
                          <DetailsPanel row={row} item={item} release={release} c={c} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

/** A row with no fields. */
function WideRow({ span, children }: { readonly span: number; readonly children: ReactNode }) {
  return (
    <tr className="@max-3xl/rows:block">
      <td colSpan={span} className={cn(ROW_LINE, "p-0 @max-3xl/rows:block @max-3xl/rows:border-t")}>
        <div className="p-3 @3xl/rows:ps-10">{children}</div>
      </td>
    </tr>
  );
}

/** A draft row whose Item could not be read, or is gone. */
function MissingItemRow({
  itemId,
  lookup,
  onRemove,
}: {
  readonly itemId: string;
  readonly lookup: Exclude<AddController["lookup"], "loading">;
  readonly onRemove: (itemId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="size-14 shrink-0 rounded-lg bg-muted outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        {lookup === "failed" ? "Could not load this item" : "No longer in the item database"}
      </p>
      <Button
        type="button"
        id={removeButtonId(itemId)}
        variant="ghost"
        size="icon"
        aria-label="Remove this row"
        onClick={() => onRemove(itemId)}
      >
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
      </Button>
    </div>
  );
}

function ItemRow({
  row,
  item,
  release,
  c,
  columns,
  open,
  detailsId,
  owned,
  showsDetails,
  onToggleDetails,
}: {
  readonly row: DraftRow;
  readonly item: AddItem;
  readonly release: AddItem["latestRelease"];
  readonly c: AddController;
  readonly columns: readonly Field[];
  readonly open: boolean;
  readonly detailsId: string;
  readonly owned: boolean;
  readonly showsDetails: boolean;
  readonly onToggleDetails: () => void;
}) {
  const { itemId, selected } = row;
  const { title, externalId, image } = item;

  return (
    <tr
      data-add-row={itemId}
      className={cn(
        "motion-safe:animate-[data-in_160ms_ease-out_both] @max-3xl/rows:grid @max-3xl/rows:grid-cols-2 @max-3xl/rows:gap-x-3 @max-3xl/rows:gap-y-3 @max-3xl/rows:border-t @max-3xl/rows:border-border/60 @max-3xl/rows:p-3",
      )}
    >
      <td
        data-add-col="item"
        className={cn(
          ROW_LINE,
          "px-3 py-2 align-middle @max-3xl/rows:col-span-2 @max-3xl/rows:block @max-3xl/rows:p-0",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Checkbox
            aria-label={`Select ${title}`}
            checked={selected}
            onCheckedChange={(checked) => c.select(itemId, checked === true)}
          />
          <Link
            {...itemDestination(itemId, externalId)}
            className="shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            tabIndex={-1}
            aria-hidden="true"
          >
            <ImageThumbnail
              images={image ? [image] : []}
              title={title}
              decorative
              className={cn(THUMBNAIL, !selected && "opacity-50")}
              fallbackIcon={
                <HugeiconsIcon
                  icon={Image01Icon}
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              }
            />
          </Link>
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              {...itemDestination(itemId, externalId)}
              title={title}
              className={cn(
                "line-clamp-2 rounded-sm font-medium [overflow-wrap:anywhere] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
                !selected && "text-muted-foreground",
              )}
            >
              {title}
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {externalId === null ? (
                <span>Custom item</span>
              ) : (
                <a
                  href={mfcItemUrl(externalId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm tabular-nums outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  MFC #{externalId}
                </a>
              )}
            </div>
          </div>
        </div>
      </td>
      {columns.map((column) => (
        <td
          key={column.id}
          data-add-col={column.id}
          data-add-cell=""
          className={cn(
            ROW_LINE,
            "px-1.5 py-2 align-middle @max-3xl/rows:block @max-3xl/rows:p-0",
            column.id === "price" && "@max-3xl/rows:col-span-2",
          )}
        >
          <div className="relative">
            {differingRows(c, column.id).has(itemId) ? (
              <>
                <span
                  aria-hidden="true"
                  title="Differs from the rest of this column"
                  className="absolute end-1.5 top-1.5 z-1 size-1.5 rounded-full bg-foreground/70"
                />
                <span className="sr-only">Differs from the rest of this column.</span>
              </>
            ) : null}
            <RowField
              field={column}
              row={row}
              item={item}
              release={release}
              c={c}
              issues={c.issues}
            />
          </div>
        </td>
      ))}
      <td
        data-add-col="actions"
        className={cn(
          ROW_LINE,
          "pe-2 align-middle @max-3xl/rows:col-span-2 @max-3xl/rows:block @max-3xl/rows:pe-0",
        )}
      >
        <div className="flex items-center justify-end gap-0.5 @max-3xl/rows:justify-between">
          {showsDetails ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!owned}
              title={owned ? undefined : "Choose where these go to add details"}
              aria-label={`Details for ${title}`}
              aria-expanded={open}
              aria-controls={open ? detailsId : undefined}
              className="@max-3xl/rows:-ms-2"
              onClick={onToggleDetails}
            >
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={cn(
                  "transition-transform duration-150 ease-out motion-reduce:transition-none",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
              <span className="@3xl/rows:hidden" aria-hidden="true">
                Details
              </span>
            </Button>
          ) : null}
          <Button
            type="button"
            id={removeButtonId(itemId)}
            variant="ghost"
            size="sm"
            aria-label={`Remove ${title}`}
            className="@max-3xl/rows:ms-auto @max-3xl/rows:-me-2"
            onClick={() => c.handleRemove(itemId)}
          >
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
            <span className="@3xl/rows:hidden" aria-hidden="true">
              Remove
            </span>
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Everything the row can hold that has no column: one layout, whatever the destination. */
function DetailsPanel({
  row,
  item,
  release,
  c,
}: {
  readonly row: DraftRow;
  readonly item: AddItem;
  readonly release: AddItem["latestRelease"];
  readonly c: AddController;
}) {
  const shared = { row, item, release, c, issues: c.issues };
  const isCollection = c.resolvedForm.kind === "collection";
  return (
    <div
      role="group"
      aria-label={`Details for ${item.title}`}
      // Its edges are the title's start and the Condition field's end: the row's padding, the
      // checkbox, the thumbnail and two gaps, then the actions column and the cell's padding.
      className="grid gap-5 p-3 motion-safe:animate-[data-in_160ms_ease-out_both] @3xl/rows:ps-25 @4xl/rows:pe-25.5"
    >
      <FieldGroup title="Purchase" className="@4xl:grid-cols-4">
        <div className="col-span-2 min-w-0">
          <ReleaseField row={row} item={item} release={release} c={c} />
        </div>
        {isCollection ? (
          <>
            <RowField field={FIELD.shop} {...shared} />
            <RowField field={FIELD.shipping} {...shared} />
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
    </div>
  );
}

function LoadingRow({ columns }: { readonly columns: readonly Field[] }) {
  return (
    <tr
      aria-hidden="true"
      className="@max-3xl/rows:block @max-3xl/rows:border-t @max-3xl/rows:border-border/60 @max-3xl/rows:p-3"
    >
      <td className={cn(ROW_LINE, "px-3 py-2 @max-3xl/rows:block @max-3xl/rows:p-0")}>
        <div className="flex items-center gap-3">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className={THUMBNAIL} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </td>
      {columns.map((column) => (
        <td key={column.id} className={cn(ROW_LINE, "px-1.5 py-2 @max-3xl/rows:hidden")}>
          <Skeleton className="h-8 w-full" />
        </td>
      ))}
      <td className={cn(ROW_LINE, "px-3 py-2 @max-3xl/rows:hidden")}>
        <Skeleton className="ms-auto h-8 w-16" />
      </td>
    </tr>
  );
}
