import { AnimatePresence, motion } from "motion/react";
import { useGlide } from "@/hooks/use-glide";
import { EASE_OUT } from "@/lib/motion-policy";
import type { AddController } from "./add-controller";
import { CommitButton } from "./commit-button";
import { choiceOf, commitSummary } from "./commit-input";
import { Swap, WORDS } from "./destination-motion";

const ENTER = { duration: 0.2, ease: EASE_OUT } as const;
const AWAY = { opacity: 0, transform: "translateY(8px)" };
const IN_PLACE = { opacity: 1, transform: "translateY(0px)" };

function Bar({ controller: c }: { readonly controller: AddController }) {
  const summary = commitSummary(c.destination, c.selectedCount) ?? [
    "Choose Collection, Order or Item Database.",
  ];
  const summaryText = summary.join(", ");
  // Only a phone's wrapped bar changes height, when its summary takes another line.
  const glideBar = useGlide<HTMLElement>(summaryText, { axis: "height" });
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
      <div className="relative min-w-0 flex-1 basis-56">
        <Swap move={WORDS} id={choiceOf(c.resolvedForm) ?? "unset"} element="div">
          <ul
            className="flex max-h-10 min-w-0 flex-wrap gap-x-4 overflow-hidden text-sm text-muted-foreground tabular-nums [overflow-wrap:anywhere]"
            title={summaryText}
          >
            {summary.map((part) => (
              <li key={part}>{part}</li>
            ))}
          </ul>
        </Swap>
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
    <div className="empty:hidden md:sticky md:bottom-0 md:z-20 md:-mb-8 md:bg-background md:pb-6">
      <AnimatePresence initial={false}>
        {c.hasItems ? <Bar key="commit" controller={c} /> : null}
      </AnimatePresence>
    </div>
  );
}
