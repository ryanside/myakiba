import { useState } from "react";
import { PageHeader, formatCount } from "@/components/page-header";
import { getCurrencyLocale } from "@/lib/locale";
import { parseMoneyInputToMinorUnits } from "@/lib/money-input";
import type { AddSearch as AddSearchParams } from "@/lib/add-search";
import { releasePriceDefault } from "@myakiba/contracts/add/schema";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { useAddController } from "./add-controller";
import type { AddController } from "./add-controller";
import { LiveRegions, Notices } from "./add-notices";
import { AddItems } from "./add-table";
import { CommitButton } from "./commit-button";
import { commitSummary } from "./commit-input";
import { DestinationSentence } from "./destination-sentence";
import { feeTotal, OrderDetails } from "./order-details";

// The header and this page's padding take 6rem, and the inset sidebar's margin 1rem more. The page
// scrolls inside this height, so only the bar stays in view. Below 36rem tall it flows as a whole.
const PAGE_HEIGHT =
  "h-[calc(100dvh-6rem)] md:h-[calc(100dvh-7rem)] [@media(max-height:36rem)]:h-auto";

/**
 * What the selected rows and a new Order's fees will save, or null when a typed price cannot be
 * read. A blank row saves what the contract defaults it to.
 */
function plannedTotal(c: AddController): number | null {
  const { order, kind } = c.resolvedForm;
  let total = kind === "order" && order.kind === "new" ? feeTotal(order.fields) : 0;
  for (const { row, item } of c.selectedRows) {
    const text = (row.overrides.price ?? "").trim();
    if (text === "") {
      total += releasePriceDefault(c.releaseOf(row, item), c.currency);
      continue;
    }
    const parsed = parseMoneyInputToMinorUnits(text);
    if (parsed.isErr()) return null;
    total += parsed.value;
  }
  return total;
}

function CommitBar({ controller: c }: { readonly controller: AddController }) {
  const count = c.commitRows.length;
  const ownership = c.destination.ownership;
  const total = ownership && ownership.kind !== "none" && count > 0 ? plannedTotal(c) : null;
  const summary =
    c.rows.length === 0
      ? ["No items yet."]
      : (commitSummary(c.destination, count) ?? ["Choose Collection, Order or Item Database."]);
  return (
    <section
      aria-label="Commit"
      // The fade says the page carries on under this bar, so a row it cuts does not look broken. It
      // stops a pixel short, or it paints over the ring's top edge.
      className="@container/bar relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-card px-3 py-2.5 shadow-lg ring-1 ring-foreground/10 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:mb-px before:h-6 before:bg-linear-to-t before:from-background before:to-transparent max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:before:hidden"
    >
      {/* Two lines at most: twenty Lists would otherwise push the button off a short screen. */}
      <ul
        className="flex max-h-10 min-w-0 flex-1 basis-56 flex-wrap gap-x-4 overflow-hidden text-sm text-muted-foreground tabular-nums [overflow-wrap:anywhere]"
        title={summary.join(", ")}
      >
        {summary.map((part) => (
          <li key={part}>{part}</li>
        ))}
      </ul>
      {total === null ? null : (
        <p className="text-sm tabular-nums">
          Total {formatCurrencyFromMinorUnits(total, c.currency, getCurrencyLocale(c.currency))}
        </p>
      )}
      <CommitButton {...c.commitProps} />
    </section>
  );
}

export function AddPage({ search }: { readonly search: AddSearchParams }) {
  const c = useAddController(search);
  const [filled, setFilled] = useState("");
  const { kind } = c.resolvedForm;
  const hasDraft = c.rows.length > 0;
  return (
    <div
      className={`@container/add mx-auto flex w-full max-w-5xl flex-col ${PAGE_HEIGHT} max-md:h-auto max-md:pb-32`}
    >
      <LiveRegions controller={c} />
      <p role="status" className="sr-only">
        {filled}
      </p>
      {/* The whole page scrolls as one, as the Collection and Orders pages do, and only the bar stays. */}
      <div
        data-add-pane=""
        // A commit in flight holds what it was sent with, so nothing here can change under it.
        inert={c.sending}
        className="relative -mx-2 -mt-1 flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain scroll-pt-9 px-2 pt-1 pb-6 **:scroll-mb-6 max-md:overflow-visible max-md:**:scroll-mb-40 [@media(max-height:36rem)]:overflow-visible"
      >
        <PageHeader
          title={search.from === "mfc" ? "Review your picks" : "Add items"}
          // The page's background runs behind this, and it is darker than other pages'.
          meta={
            <span className="text-foreground/80">
              {formatCount(c.rows.length, "Item", "Items")}
            </span>
          }
        />
        <div className="flex flex-col gap-2 empty:hidden">
          <Notices controller={c} />
        </div>
        <div className="flex flex-col gap-4">
          <DestinationSentence controller={c} disabled={!hasDraft} />
          {hasDraft && kind === "order" ? <OrderDetails controller={c} /> : null}
        </div>
        <AddItems controller={c} onAnnounce={setFilled} />
      </div>
      <CommitBar controller={c} />
    </div>
  );
}
