import { useState } from "react";
import { PageHeader, formatCount } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { AddSearch as AddSearchParams } from "@/lib/add-search";
import { useAddController } from "./add-controller";
import { LiveRegions, Notices } from "./add-notices";
import { AddItems } from "./add-table";
import { CommitBar } from "./commit-bar";
import { OrderSwap, useSlide } from "./destination-motion";
import { DestinationSentence } from "./destination-sentence";
import { OrderDetails } from "./order-details";

export function AddPage({ search }: { readonly search: AddSearchParams }) {
  const c = useAddController(search);
  const [filled, setFilled] = useState("");
  const { kind, order } = c.resolvedForm;
  const orderId = c.hasItems && kind === "order" ? order.kind : null;
  const slide = useSlide<HTMLDivElement>(orderId);
  return (
    <div
      // The page scrolls under the sticky header and the commit bar, so what takes focus stays clear
      // of both. On a phone the bar is fixed, so the padding lets the last row clear it.
      className={cn(
        "@container/add mx-auto flex w-full max-w-5xl flex-col gap-6 **:scroll-mt-9 **:scroll-mb-28 max-md:**:scroll-mb-32 md:min-h-[calc(100dvh-7rem)]",
        c.hasItems && "max-md:pb-32",
      )}
    >
      <LiveRegions controller={c} />
      <p role="status" className="sr-only">
        {filled}
      </p>
      {/* A commit in flight holds what it was sent with, so nothing here can change under it. */}
      <div inert={c.sending} className="flex flex-1 flex-col gap-6">
        <PageHeader
          title={search.from === "mfc" ? "Review your picks" : "Add items"}
          meta={formatCount(c.rows.length + c.savingPicks, "Item", "Items")}
        />
        <div className="flex flex-col gap-2 empty:hidden">
          <Notices controller={c} />
        </div>
        <div className="relative flex flex-col">
          <DestinationSentence controller={c} disabled={!c.hasItems} />
          <OrderSwap id={orderId}>
            <OrderDetails controller={c} />
          </OrderSwap>
        </div>
        <div ref={slide} className="flex flex-col gap-6">
          <AddItems controller={c} onAnnounce={setFilled} />
        </div>
      </div>
      <CommitBar controller={c} />
    </div>
  );
}
