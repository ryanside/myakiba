import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { AnimatePresence, motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlide } from "@/hooks/use-glide";
import { getCurrencyLocale } from "@/lib/locale";
import type { AddController } from "./add-controller";
import { CommitButton } from "./commit-button";
import { commitSummary } from "./commit-input";
import { feeTotal } from "./order-details";
import { plannedPrice } from "./row-fields";

const ENTER = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
const AWAY = { opacity: 0, transform: "translateY(8px)" };
const IN_PLACE = { opacity: 1, transform: "translateY(0px)" };

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

function totalText(c: AddController): string | null {
  if (c.pending) return null;
  const total = plannedTotal(c);
  // A price the page cannot read keeps the slot, so fixing it moves nothing.
  return total === null
    ? "—"
    : formatCurrencyFromMinorUnits(total, c.currency, getCurrencyLocale(c.currency));
}

function Bar({ controller: c }: { readonly controller: AddController }) {
  const ownership = c.destination.ownership;
  const showsTotal = ownership !== null && ownership.kind !== "none" && c.selectedCount > 0;
  const text = showsTotal ? totalText(c) : null;
  const summary = commitSummary(c.destination, c.selectedCount) ?? [
    "Choose Collection, Order or Item Database.",
  ];
  const summaryText = summary.join(", ");
  const glideTotal = useGlide<HTMLDivElement>(`${showsTotal} ${text}`, { fade: true });
  // Only a phone's wrapped bar changes height, when its Total comes or goes.
  const glideBar = useGlide<HTMLElement>(`${showsTotal} ${summaryText}`, { axis: "height" });
  return (
    <motion.section
      ref={glideBar}
      aria-label="Commit"
      initial={AWAY}
      animate={IN_PLACE}
      exit={AWAY}
      transition={ENTER}
      // The fade says the page carries on under this bar, so a row it cuts does not look broken. It
      // stops a pixel short, or it paints over the ring's top edge.
      className="@container/bar relative z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-card px-3 py-2.5 shadow-lg ring-1 ring-foreground/10 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:mb-px before:h-6 before:bg-linear-to-t before:from-background before:to-transparent max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:before:hidden"
    >
      {/* Two lines at most: twenty Lists would otherwise push the button off a short screen. */}
      <ul
        className="flex max-h-10 min-w-0 flex-1 basis-56 flex-wrap gap-x-4 overflow-hidden text-sm text-muted-foreground tabular-nums [overflow-wrap:anywhere]"
        title={summaryText}
      >
        {summary.map((part) => (
          <li key={part}>{part}</li>
        ))}
      </ul>
      <div
        ref={glideTotal}
        className="shrink-0 text-sm whitespace-nowrap tabular-nums empty:hidden"
      >
        {showsTotal ? (
          <>Total {text ?? <Skeleton className="inline-block h-4 w-16 align-middle" />}</>
        ) : null}
      </div>
      <CommitButton {...c.commitProps} />
    </motion.section>
  );
}

/**
 * The page's one action, there only while there is something to commit. Rows pass under it, so what
 * holds it covers them down to the page's edge. A page that loads with rows has it from first paint.
 */
export function CommitBar({ controller: c }: { readonly controller: AddController }) {
  return (
    <div className="empty:hidden md:sticky md:bottom-0 md:z-20 md:-mb-6 md:bg-background md:pb-6">
      <AnimatePresence initial={false}>
        {c.hasItems ? <Bar key="commit" controller={c} /> : null}
      </AnimatePresence>
    </div>
  );
}
