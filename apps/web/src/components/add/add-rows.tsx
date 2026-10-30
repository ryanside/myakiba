import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Image01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import { releasePriceDefault } from "@myakiba/contracts/add/schema";
import { CONDITIONS } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { PickRow } from "@/data/picks";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { itemDestination } from "@/lib/item-destination";
import { formatReleasePrice, getCurrencyLocale } from "@/lib/locale";
import { pickFailureCopy } from "@/lib/pick-failure";
import { cn } from "@/lib/utils";
import { AddRowDetails } from "./add-row-details";
import type { DraftRow, RowOverrides } from "./add-draft";
import { AmountInput, EnumSelect, LabeledField } from "./add-fields";
import { priceFieldId } from "./commit-input";
import type { AddItem, CommitIssue, Ownership, SharedFields } from "./commit-input";
import { ItemBadges } from "./item-badges";

const NARROW_CELL = "@max-2xl/rows:p-0";
const THUMBNAIL =
  "size-14 shrink-0 rounded-lg outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10";
const ROW =
  "border-t border-border/60 @max-2xl/rows:grid @max-2xl/rows:grid-cols-[1.75rem_repeat(3,minmax(0,1fr))_auto] @max-2xl/rows:gap-x-2 @max-2xl/rows:gap-y-3 @max-2xl/rows:p-3";

type Issues = readonly CommitIssue[];

/** How the read of the rows' Items stands. Only `found` lets a row without one call it gone. */
export type ItemsLookup = "loading" | "failed" | "found";

export function AddRows({
  picks,
  rows,
  items,
  lookup,
  ownership,
  currency,
  dateFormat,
  issues,
  onSelect,
  onSelectAll,
  onEdit,
  onRemove,
  onRetryPick,
  onDiscardPick,
}: {
  readonly picks: readonly PickRow[];
  readonly rows: readonly DraftRow[];
  readonly items: ReadonlyMap<string, AddItem>;
  readonly lookup: ItemsLookup;
  readonly ownership: Ownership | null;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly issues: Issues;
  readonly onSelect: (itemId: string, selected: boolean) => void;
  readonly onSelectAll: (selected: boolean) => void;
  readonly onEdit: (itemId: string, overrides: RowOverrides) => void;
  readonly onRemove: (itemId: string) => void;
  readonly onRetryPick: (mfcItemId: PickRow["mfcItemId"]) => void;
  readonly onDiscardPick: (mfcItemId: PickRow["mfcItemId"]) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const selectable = rows.filter((row) => items.has(row.itemId));
  const selectedCount = selectable.filter((row) => row.selected).length;
  const owned = ownership !== null && ownership.kind !== "none" ? ownership : null;
  const showsDetails = ownership?.kind !== "none";

  const toggle = (itemId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });

  return (
    <div className="@container/rows">
      <table className="w-full border-collapse text-sm @max-2xl/rows:block">
        <thead className="sticky top-0 z-10 bg-background text-xs text-muted-foreground @max-2xl/rows:block">
          <tr className="@max-2xl/rows:block">
            <th
              scope="col"
              className="w-10 py-2.5 pr-1 pl-3 text-start font-medium @max-2xl/rows:block @max-2xl/rows:w-auto"
            >
              <span className="flex items-center gap-3">
                <Checkbox
                  aria-label="Select all items"
                  checked={selectable.length > 0 && selectedCount === selectable.length}
                  indeterminate={selectedCount > 0 && selectedCount < selectable.length}
                  disabled={selectable.length === 0}
                  onCheckedChange={(checked) => onSelectAll(checked === true)}
                />
                <span aria-hidden="true" className="@2xl/rows:hidden">
                  Select all
                </span>
              </span>
            </th>
            <th scope="col" className="px-2 py-2.5 text-start font-medium @max-2xl/rows:sr-only">
              Item
            </th>
            <th
              scope="col"
              className="w-28 px-2 py-2.5 text-start font-medium @max-2xl/rows:sr-only"
            >
              Release
            </th>
            {showsDetails ? (
              <>
                <th
                  scope="col"
                  className="w-32 px-2 py-2.5 text-start font-medium @max-2xl/rows:sr-only"
                >
                  Price
                </th>
                <th
                  scope="col"
                  className="w-20 px-2 py-2.5 text-start font-medium @max-2xl/rows:sr-only"
                >
                  Count
                </th>
                <th
                  scope="col"
                  className="w-32 px-2 py-2.5 text-start font-medium @max-2xl/rows:sr-only"
                >
                  Condition
                </th>
              </>
            ) : null}
            <th scope="col" className="w-20 px-2 py-2.5 @max-2xl/rows:sr-only">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="@max-2xl/rows:block">
          {picks.map((pick) => (
            <PickTableRow
              key={pick.mfcItemId}
              pick={pick}
              columns={showsDetails ? 7 : 4}
              onRetry={onRetryPick}
              onDiscard={onDiscardPick}
            />
          ))}
          {rows.map((row) => {
            const item = items.get(row.itemId);
            if (!item) {
              return lookup === "loading" ? (
                <LoadingRow key={row.itemId} showsDetails={showsDetails} />
              ) : (
                <RowWithoutItem
                  key={row.itemId}
                  itemId={row.itemId}
                  text={
                    lookup === "failed"
                      ? "Could not load this item"
                      : "No longer in the item database"
                  }
                  columns={showsDetails ? 7 : 4}
                  onRemove={onRemove}
                />
              );
            }
            const isExpanded = owned !== null && expanded.has(row.itemId);
            const detailsId = `add-details-${row.itemId}`;
            return (
              <Fragment key={row.itemId}>
                <ItemRow
                  row={row}
                  item={item}
                  showsDetails={showsDetails}
                  owned={owned}
                  currency={currency}
                  dateFormat={dateFormat}
                  issues={issues}
                  expanded={isExpanded}
                  detailsId={detailsId}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onToggleDetails={toggle}
                  onRemove={onRemove}
                />
                {isExpanded ? (
                  <tr id={detailsId} className="@max-2xl/rows:block">
                    <td
                      colSpan={7}
                      className="bg-muted/30 px-3 py-4 @max-2xl/rows:block @2xl/rows:pl-13"
                    >
                      <AddRowDetails
                        row={row}
                        title={item.title}
                        ownership={owned}
                        onChange={(overrides) => onEdit(row.itemId, overrides)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({
  row,
  item,
  showsDetails,
  owned,
  currency,
  dateFormat,
  issues,
  expanded,
  detailsId,
  onSelect,
  onEdit,
  onToggleDetails,
  onRemove,
}: {
  readonly row: DraftRow;
  readonly item: AddItem;
  readonly showsDetails: boolean;
  readonly owned: Extract<Ownership, { kind: "collection" | "order" }> | null;
  readonly currency: Currency;
  readonly dateFormat: DateFormat;
  readonly issues: Issues;
  readonly expanded: boolean;
  readonly detailsId: string;
  readonly onSelect: (itemId: string, selected: boolean) => void;
  readonly onEdit: (itemId: string, overrides: RowOverrides) => void;
  readonly onToggleDetails: (itemId: string) => void;
  readonly onRemove: (itemId: string) => void;
}) {
  const { itemId, overrides, selected } = row;
  const { title, externalId, image, latestRelease: release } = item;
  const shared: SharedFields | null = owned?.kind === "collection" ? owned.shared : null;
  const releaseDate = release?.date ? formatDateOnlyForDisplay(release.date, dateFormat) : null;
  const releasePrice = release
    ? formatReleasePrice(release.price, release.priceCurrency, currency)
    : null;
  const priceId = priceFieldId(itemId);
  const priceIssue = issues.find((issue) => issue.fieldId === priceId);
  const countId = `add-count-${itemId}`;
  const conditionId = `add-condition-${itemId}`;

  return (
    <tr className={cn(ROW, "animate-data-in")}>
      <td className={cn("py-3 pr-1 pl-3 align-middle", NARROW_CELL)}>
        <Checkbox
          aria-label={`Select ${title}`}
          checked={selected}
          onCheckedChange={(checked) => onSelect(itemId, checked === true)}
          className="@max-2xl/rows:mt-1"
        />
      </td>
      <td className={cn("px-2 py-3 align-middle @max-2xl/rows:col-span-3", NARROW_CELL)}>
        <div className="flex min-w-0 items-start gap-3 @2xl/rows:items-center">
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
              className={THUMBNAIL}
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
              className="line-clamp-2 rounded-sm font-medium [overflow-wrap:anywhere] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
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
              <ItemBadges item={item} />
              <span className="tabular-nums @2xl/rows:hidden">
                <ReleaseText date={releaseDate} price={releasePrice} />
              </span>
            </div>
          </div>
        </div>
      </td>
      <td
        className={cn(
          "px-2 py-3 align-middle text-xs text-muted-foreground tabular-nums @max-2xl/rows:hidden",
        )}
      >
        <div className="flex flex-col gap-0.5">
          <span>{releaseDate ?? "No release"}</span>
          {releasePrice ? <span>{releasePrice}</span> : null}
        </div>
      </td>
      {showsDetails ? (
        <>
          <td className={cn("px-2 py-3 align-middle @max-2xl/rows:col-span-2", NARROW_CELL)}>
            <LabeledField
              id={priceId}
              label={<RowLabel name="Price" title={title} />}
              error={priceIssue?.message}
              className="@2xl/rows:gap-0"
            >
              <AmountInput
                id={priceId}
                value={overrides.price ?? ""}
                currency={currency}
                placeholder={defaultPricePlaceholder(release, currency)}
                invalid={priceIssue !== undefined}
                onChange={(price) => onEdit(itemId, { price })}
              />
            </LabeledField>
          </td>
          <td className={cn("px-2 py-3 align-middle", NARROW_CELL)}>
            <LabeledField
              id={countId}
              label={<RowLabel name="Count" title={title} />}
              className="@2xl/rows:gap-0"
            >
              <Input
                id={countId}
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                className="tabular-nums"
                value={overrides.count ?? ""}
                placeholder={String(shared?.count ?? 1)}
                onChange={(event) => onEdit(itemId, { count: readCount(event.target.value) })}
              />
            </LabeledField>
          </td>
          <td className={cn("px-2 py-3 align-middle @max-2xl/rows:col-span-2", NARROW_CELL)}>
            <LabeledField
              id={conditionId}
              label={<RowLabel name="Condition" title={title} />}
              className="@2xl/rows:gap-0"
            >
              <EnumSelect
                id={conditionId}
                value={overrides.condition ?? shared?.condition ?? "New"}
                options={CONDITIONS}
                onChange={(condition) => onEdit(itemId, { condition })}
              />
            </LabeledField>
          </td>
        </>
      ) : null}
      <td
        className={cn(
          "py-3 pr-2 pl-1 align-middle @max-2xl/rows:col-start-5 @max-2xl/rows:row-start-1",
          NARROW_CELL,
        )}
      >
        <div className="flex items-center justify-end gap-0.5">
          {showsDetails ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={owned === null}
              title={owned === null ? "Choose where these go to add details" : undefined}
              aria-label={`Details for ${title}`}
              aria-expanded={expanded}
              aria-controls={expanded ? detailsId : undefined}
              onClick={() => onToggleDetails(itemId)}
            >
              <HugeiconsIcon icon={expanded ? ArrowUp01Icon : ArrowDown01Icon} aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            id={removeButtonId(itemId)}
            variant="ghost"
            size="icon"
            aria-label={`Remove ${title}`}
            onClick={() => onRemove(itemId)}
          >
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export const removeButtonId = (itemId: string) => `add-remove-${itemId}`;

function RowLabel({ name, title }: { readonly name: string; readonly title: string }) {
  return (
    <>
      <span className="@2xl/rows:sr-only">{name}</span>
      <span className="sr-only"> for {title}</span>
    </>
  );
}

function ReleaseText({
  date,
  price,
}: {
  readonly date: string | null;
  readonly price: string | null;
}) {
  return <>{[date ?? "No release", price].filter((part) => part !== null).join(" · ")}</>;
}

function readCount(text: string): number | undefined {
  const count = Number.parseInt(text, 10);
  return Number.isNaN(count) ? undefined : Math.min(Math.max(count, 1), 999);
}

/** The price a blank row gets. A release in another currency is shown beside the row, not converted. */
function defaultPricePlaceholder(release: AddItem["latestRelease"], currency: Currency): string {
  return formatCurrencyFromMinorUnits(
    releasePriceDefault(release, currency),
    currency,
    getCurrencyLocale(currency),
  );
}

function PickTableRow({
  pick,
  columns,
  onRetry,
  onDiscard,
}: {
  readonly pick: PickRow;
  readonly columns: number;
  readonly onRetry: (mfcItemId: PickRow["mfcItemId"]) => void;
  readonly onDiscard: (mfcItemId: PickRow["mfcItemId"]) => void;
}) {
  const title = pick.title ?? `MFC item #${pick.mfcItemId}`;
  const copy = pick.state === "failed" ? pickFailureCopy(pick.reason, pick.mfcItemId) : null;
  return (
    <tr className="border-t border-border/60 @max-2xl/rows:block">
      <td colSpan={columns} className="px-3 py-3 @max-2xl/rows:block">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 @2xl/rows:pl-10">
          <div
            className={cn(THUMBNAIL, "flex items-center justify-center bg-muted")}
            aria-hidden="true"
          >
            {copy ? (
              <HugeiconsIcon icon={Alert02Icon} className="size-5 text-warning" />
            ) : (
              <Spinner className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
            <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{title}</span>
            {copy ? (
              <span className="text-xs text-pretty text-muted-foreground">{copy.text}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
          </div>
          {copy ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {copy.actions.map((action) => {
                if (action.kind === "retry") {
                  return (
                    <Button
                      key="retry"
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Retry ${title}`}
                      onClick={() => onRetry(pick.mfcItemId)}
                    >
                      Retry
                    </Button>
                  );
                }
                if (action.kind === "open") {
                  return (
                    <a
                      key={action.href}
                      href={action.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm px-1.5 text-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {action.label}
                    </a>
                  );
                }
                // The notice above the rows holds the one resend button.
                return null;
              })}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Discard ${title}`}
                onClick={() => onDiscard(pick.mfcItemId)}
              >
                Discard
              </Button>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function LoadingRow({ showsDetails }: { readonly showsDetails: boolean }) {
  return (
    <tr className={ROW} aria-hidden="true">
      <td className={cn("py-3 pr-1 pl-3", NARROW_CELL)}>
        <Skeleton className="size-4 rounded-[4px]" />
      </td>
      <td className={cn("px-2 py-3 @max-2xl/rows:col-span-3", NARROW_CELL)}>
        <div className="flex items-center gap-3">
          <Skeleton className={THUMBNAIL} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </td>
      <td className="px-2 py-3 @max-2xl/rows:hidden">
        <Skeleton className="h-3 w-16" />
      </td>
      {showsDetails ? (
        <>
          <td className="px-2 py-3 @max-2xl/rows:hidden">
            <Skeleton className="h-8 w-full" />
          </td>
          <td className="px-2 py-3 @max-2xl/rows:hidden">
            <Skeleton className="h-8 w-full" />
          </td>
          <td className="px-2 py-3 @max-2xl/rows:hidden">
            <Skeleton className="h-8 w-full" />
          </td>
        </>
      ) : null}
      <td className="px-2 py-3 @max-2xl/rows:hidden">
        <Skeleton className="ms-auto size-8" />
      </td>
    </tr>
  );
}

function RowWithoutItem({
  itemId,
  text,
  columns,
  onRemove,
}: {
  readonly itemId: string;
  readonly text: string;
  readonly columns: number;
  readonly onRemove: (itemId: string) => void;
}) {
  return (
    <tr className="border-t border-border/60 @max-2xl/rows:block">
      <td colSpan={columns} className="px-3 py-3 @max-2xl/rows:block">
        <div className="flex items-center gap-3 @2xl/rows:pl-10">
          <div className={cn(THUMBNAIL, "bg-muted")} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
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
      </td>
    </tr>
  );
}
