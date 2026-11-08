import { getRouteApi } from "@tanstack/react-router";
import { PageHeader, formatCount } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { AddSearch as AddSearchParams } from "@/lib/add-search";
import { useAddController } from "./add-controller";
import { LiveRegions, Notices } from "./add-notices";
import { AddItems } from "./add-table";
import { CommitButton } from "./commit-button";
import { OrderSwap, useSlide } from "./destination-motion";
import { DestinationSentence } from "./destination-sentence";
import { OrderDetails } from "./order-details";

const appRouteApi = getRouteApi("/(app)");

export function AddPage({ search }: { readonly search: AddSearchParams }) {
  const userId = appRouteApi.useRouteContext().session.user.id;
  // A sign-in from another tab changes the account without a reload, so the page starts over
  // instead of showing, or saving under the new account, what the last one left in memory.
  return <AccountAddPage key={userId} search={search} />;
}

function AccountAddPage({ search }: { readonly search: AddSearchParams }) {
  const c = useAddController(search);
  const { kind, order } = c.resolvedForm;
  const orderId = c.hasItems && kind === "order" ? order.kind : null;
  const slide = useSlide<HTMLDivElement>(orderId);
  return (
    <div className="@container/add mx-auto flex w-full max-w-5xl flex-col gap-6">
      <LiveRegions controller={c} />
      <PageHeader
        title={search.from === "mfc" ? "Review your picks" : "Add items"}
        meta={formatCount(c.rowCount, "Item", "Items")}
      />
      {/* A commit in flight holds what it was sent with, so nothing here can change under it. The
      button that sent it stays out of that, so it keeps focus while it shows how the commit went. */}
      <div inert={c.sending} className="flex flex-col gap-2 empty:hidden">
        <Notices controller={c} />
      </div>
      {/* What the Order's fields add is a group of its own, so the table keeps clear of them. */}
      <div className={cn("flex flex-col", orderId === null ? "gap-2.5" : "gap-4")}>
        <div className="relative flex flex-col">
          <div className="@container/sentence">
            <DestinationSentence controller={c} disabled={!c.hasItems}>
              <CommitButton {...c.commitProps} />
            </DestinationSentence>
          </div>
          <div inert={c.sending}>
            <OrderSwap id={orderId}>
              <OrderDetails controller={c} />
            </OrderSwap>
          </div>
        </div>
        <div ref={slide} inert={c.sending}>
          <AddItems controller={c} />
        </div>
      </div>
    </div>
  );
}
