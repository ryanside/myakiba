import { useState } from "react";
import { PageHeader, WORKSPACE_CLASS_NAME, formatCount } from "@/components/page-header";
import { ActionBar, ActionBarSelection, ActionBarSeparator } from "@/components/ui/action-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrencyLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { AddSearch as AddSearchParams } from "@/lib/add-search";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useAddController } from "./add-controller";
import type { AddController } from "./add-controller";
import { LiveRegions, Notices } from "./add-notices";
import { AddItems } from "./add-table";
import { CommitButton } from "./commit-button";
import { commitSummary } from "./commit-input";
import { DestinationSentence } from "./destination-sentence";
import { feeTotal, OrderDetails } from "./order-details";
import { plannedPrice } from "./row-fields";

/**
 * What the selected rows and a new Order's fees will save, or null when a typed price cannot be
 * read. A blank row saves what the contract defaults it to.
 */
function plannedTotal(c: AddController): number | null {
  const { order, kind } = c.resolvedForm;
  let total = kind === "order" && order.kind === "new" ? feeTotal(order.fields) : 0;
  for (const { row, item } of c.selectedRows) {
    const price = plannedPrice(row, c.releaseOf(row, item), c.currency);
    if (price === null) return null;
    total += price;
  }
  return total;
}

function CommitBar({ controller: c }: { readonly controller: AddController }) {
  const count = c.selectedCount;
  const ownership = c.destination.ownership;
  const showsTotal = ownership && ownership.kind !== "none" && count > 0;
  const total = showsTotal && !c.itemsLoading ? plannedTotal(c) : null;
  const summary =
    c.rows.length === 0
      ? null
      : (commitSummary(c.destination, count) ?? ["Choose Collection, Order or Item Database."]);
  return (
    // Always open, so it has no way to be dismissed, and it is there from the first paint.
    <ActionBar open aria-label="Commit" className="animate-none!">
      {summary === null ? null : (
        <>
          <ActionBarSelection className="min-w-0 border-none">
            {/* Two lines at most: twenty Lists would otherwise push the button off the screen. */}
            <ul
              className="flex max-h-10 max-w-md min-w-0 flex-wrap gap-x-4 overflow-hidden [overflow-wrap:anywhere]"
              title={summary.join(", ")}
            >
              {summary.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
          </ActionBarSelection>
          <ActionBarSeparator className="max-sm:hidden" />
        </>
      )}
      {showsTotal && (c.itemsLoading || total !== null) ? (
        <div className="px-1 text-sm tabular-nums">
          Total {/* Holds the room of an ordinary total, so the Items loading moves nothing. */}
          <div className="inline-block min-w-20">
            {total === null ? (
              <Skeleton className="inline-block h-4 w-16 align-middle" />
            ) : (
              formatCurrencyFromMinorUnits(total, c.currency, getCurrencyLocale(c.currency))
            )}
          </div>
        </div>
      ) : null}
      <CommitButton {...c.commitProps} />
    </ActionBar>
  );
}

export function AddPage({ search }: { readonly search: AddSearchParams }) {
  const c = useAddController(search);
  const [filled, setFilled] = useState("");
  const { kind } = c.resolvedForm;
  const hasDraft = c.rows.length > 0;
  return (
    <div
      // The page scrolls under the sticky header and the fixed bar, so what takes focus stays clear
      // of both, and the bar never covers the last row.
      className={cn(
        WORKSPACE_CLASS_NAME,
        "@container/add pb-20 **:scroll-mt-9 **:scroll-mb-24 max-sm:pb-36 max-sm:**:scroll-mb-40",
      )}
    >
      <LiveRegions controller={c} />
      <p role="status" className="sr-only">
        {filled}
      </p>
      {/* A commit in flight holds what it was sent with, so nothing here can change under it. */}
      <div inert={c.sending} className="flex flex-col gap-4">
        <div className="mb-2">
          <PageHeader
            title={search.from === "mfc" ? "Review your picks" : "Add items"}
            meta={formatCount(c.rows.length, "Item", "Items")}
          />
        </div>
        <div className="flex flex-col gap-2 empty:hidden">
          <Notices controller={c} />
        </div>
        <DestinationSentence controller={c} disabled={!hasDraft} />
        {hasDraft && kind === "order" ? <OrderDetails controller={c} /> : null}
        <AddItems controller={c} onAnnounce={setFilled} />
      </div>
      <CommitBar controller={c} />
    </div>
  );
}
