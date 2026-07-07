import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete01Icon, Edit03Icon, Loading03Icon, MoveIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import CollectionItemForm from "@/components/collection/collection-item-form";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { Badge, ThemedBadge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Timeline,
  TimelineItem,
  TimelineHeader,
  TimelineDate,
  TimelineTitle,
  TimelineIndicator,
  TimelineSeparator,
} from "@/components/reui/timeline";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { getStatusVariant } from "@/lib/orders";
import { cn } from "@/lib/utils";
import type { ItemCollectionEntry, ItemDetail, ItemRelatedOrder } from "@/components/item/types";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { CascadeOptions, NewOrder } from "@myakiba/contracts/orders/schema";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): ReactNode {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export function CollectionItemCard({
  collectionItem,
  item,
  externalId,
  relatedOrder,
  currency,
  locale,
  dateFormat,
  onEdit,
  onDelete,
  onMoveToExisting,
  onMoveToNew,
  isOrderActionPending,
  className,
}: {
  readonly collectionItem: ItemCollectionEntry;
  readonly item: ItemDetail;
  readonly externalId: number;
  readonly relatedOrder: ItemRelatedOrder | undefined;
  readonly currency: Currency;
  readonly locale: string;
  readonly dateFormat: DateFormat;
  readonly onEdit: (values: CollectionItemFormValues) => Promise<void>;
  readonly onDelete: (collectionIds: ReadonlySet<string>) => Promise<void>;
  readonly onMoveToExisting: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  readonly onMoveToNew: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly isOrderActionPending: boolean;
  readonly className?: string;
}): ReactNode {
  const release = item.releases.find((r) => r.id === collectionItem.releaseId);
  const timelineSteps = [
    { step: 1, title: "Ordered", date: collectionItem.orderDate },
    { step: 2, title: "Paid", date: collectionItem.paymentDate },
    { step: 3, title: "Shipped", date: collectionItem.shippingDate },
    { step: 4, title: "Collected", date: collectionItem.collectionDate },
  ] as const;
  const activeStep = timelineSteps.findLast(({ date }) => date)?.step ?? 0;
  const hasScore = Boolean(collectionItem.score) && Number.parseFloat(collectionItem.score) !== 0;
  const hasExtras = hasScore || collectionItem.tags.length > 0 || Boolean(collectionItem.notes);

  return (
    <div className={cn("flex flex-col gap-5 animate-appear", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ThemedBadge variant={getStatusVariant(collectionItem.status)}>
            {collectionItem.status}
          </ThemedBadge>
          {release && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">
              {formatDateOnlyForDisplay(release.date, dateFormat)}
            </span>
          )}
        </div>
        <div className="flex items-center -mr-2">
          <CollectionItemForm
            renderTrigger={
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                <HugeiconsIcon icon={Edit03Icon} className="size-3.5" />
              </Button>
            }
            itemData={{
              ...collectionItem,
              id: collectionItem.id,
              itemExternalId: externalId,
              itemTitle: item.title,
              itemImage: item.image,
              releaseDate: release?.date ?? null,
              releasePrice: release?.price ?? null,
              releaseCurrency: release?.priceCurrency ?? null,
              releaseBarcode: release?.barcode ?? null,
              releaseType: release?.type ?? null,
            }}
            callbackFn={onEdit}
            currency={currency}
            dateFormat={dateFormat}
          />
          <UnifiedItemMoveForm
            renderTrigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                disabled={isOrderActionPending}
              >
                <HugeiconsIcon
                  icon={isOrderActionPending ? Loading03Icon : MoveIcon}
                  className={cn("size-3.5", isOrderActionPending && "animate-spin")}
                />
                <span className="sr-only">Assign order</span>
              </Button>
            }
            selectedItems={{
              collectionIds: new Set([collectionItem.id]),
              orderIds: collectionItem.orderId
                ? new Set([collectionItem.orderId])
                : new Set<string>(),
            }}
            onMoveToExisting={onMoveToExisting}
            onMoveToNew={onMoveToNew}
            currency={currency}
            intent="add"
          />
          <ConfirmDialog
            renderTrigger={
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                <HugeiconsIcon icon={Delete01Icon} className="size-3.5" />
                <span className="sr-only">Delete collection item</span>
              </Button>
            }
            title="Delete item?"
            description="This will permanently remove this item from your collection."
            onConfirm={() => onDelete(new Set([collectionItem.id]))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <DetailRow label="Count">{collectionItem.count}</DetailRow>
        <DetailRow label="Price">
          {formatCurrencyFromMinorUnits(collectionItem.price, currency, locale)}
        </DetailRow>
        <DetailRow label="Condition">{collectionItem.condition}</DetailRow>
        {collectionItem.shop && <DetailRow label="Shop">{collectionItem.shop}</DetailRow>}
        <DetailRow label="Shipping">{collectionItem.shippingMethod}</DetailRow>
      </div>

      {activeStep > 0 && (
        <Timeline orientation="horizontal" value={activeStep}>
          {timelineSteps.map(({ step, title, date }) => (
            <TimelineItem key={step} step={step}>
              <TimelineIndicator />
              <TimelineSeparator />
              <TimelineHeader>
                <TimelineTitle>{title}</TimelineTitle>
                <TimelineDate>{formatDateOnlyForDisplay(date, dateFormat)}</TimelineDate>
              </TimelineHeader>
            </TimelineItem>
          ))}
        </Timeline>
      )}

      {hasExtras && (
        <div className="flex flex-col gap-3">
          {hasScore && <DetailRow label="Score">{collectionItem.score}</DetailRow>}
          {collectionItem.tags.length > 0 && (
            <div className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted-foreground shrink-0">Tags</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {collectionItem.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {collectionItem.notes && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">Notes</span>
              <p className="text-sm leading-relaxed text-foreground/75 whitespace-pre-wrap">
                {collectionItem.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {relatedOrder && (
        <Link
          to="/orders/$id"
          params={{ id: relatedOrder.id }}
          className="text-sm text-primary transition-colors duration-150 ease-out hover:text-primary/80 underline-offset-4 hover:underline"
        >
          View order: {relatedOrder.title}
        </Link>
      )}
    </div>
  );
}
