import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete01Icon,
  Edit03Icon,
  FolderAddIcon,
  Loading03Icon,
  MoveIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import CollectionItemForm from "@/components/collection/collection-item-form";
import { AddToListsDialog } from "@/components/lists/add-to-lists-dialog";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import { Badge, ThemedBadge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
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
  animateValue = false,
  animateRow = false,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly animateValue?: boolean;
  readonly animateRow?: boolean;
}): ReactNode {
  return (
    <div
      className={cn("flex items-center justify-between text-sm", animateRow && "animate-data-in")}
    >
      <span className="text-muted-foreground">{label}</span>
      <div className={cn("tabular-nums", animateValue && !animateRow && "animate-data-in")}>
        {children}
      </div>
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
  readonly collectionItem: ItemCollectionEntry | null;
  readonly item: ItemDetail | undefined;
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
  const release = item?.releases.find((r) => r.id === collectionItem?.releaseId);
  const timelineSteps = [
    { step: 1, title: "Ordered", date: collectionItem?.orderDate },
    { step: 2, title: "Paid", date: collectionItem?.paymentDate },
    { step: 3, title: "Shipped", date: collectionItem?.shippingDate },
    { step: 4, title: "Collected", date: collectionItem?.collectionDate },
  ] as const;
  const activeStep = timelineSteps.findLast(({ date }) => date)?.step ?? 0;
  const hasScore =
    collectionItem &&
    Boolean(collectionItem.score) &&
    Number.parseFloat(collectionItem.score) !== 0;
  const hasExtras =
    !collectionItem || hasScore || collectionItem.tags.length > 0 || Boolean(collectionItem.notes);

  const editTrigger = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      disabled={!collectionItem || !item}
    >
      <HugeiconsIcon icon={Edit03Icon} className="size-3.5" />
      <span className="sr-only">Edit collection item</span>
    </Button>
  );

  const listTrigger = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      disabled={!item || collectionItem?.status !== "Owned"}
      title={
        collectionItem?.status === "Owned"
          ? "Add collection item to List"
          : "Only owned collection items can be added to Lists"
      }
    >
      <HugeiconsIcon icon={FolderAddIcon} className="size-3.5" />
      <span className="sr-only">Add collection item to List</span>
    </Button>
  );

  const moveTrigger = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      disabled={!collectionItem || !item || isOrderActionPending}
    >
      <HugeiconsIcon
        icon={isOrderActionPending ? Loading03Icon : MoveIcon}
        className={cn("size-3.5", isOrderActionPending && "animate-spin")}
      />
      <span className="sr-only">{collectionItem?.orderId ? "Move item" : "Assign order"}</span>
    </Button>
  );

  const deleteTrigger = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      disabled={!collectionItem || !item}
    >
      <HugeiconsIcon icon={Delete01Icon} className="size-3.5" />
      <span className="sr-only">Delete collection item</span>
    </Button>
  );

  return (
    <div className={cn("flex flex-col gap-5", className)} aria-busy={!collectionItem}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {collectionItem ? (
            <ThemedBadge
              variant={getStatusVariant(collectionItem.status)}
              className="animate-data-in"
            >
              {collectionItem.status}
            </ThemedBadge>
          ) : (
            <Skeleton className="h-5 w-16 rounded-sm" />
          )}
          {!collectionItem || release ? (
            <div className="text-xs text-muted-foreground/60 tabular-nums">
              {release ? (
                <span className="animate-data-in">
                  {formatDateOnlyForDisplay(release.date, dateFormat)}
                </span>
              ) : (
                <Skeleton className="h-4 w-20" />
              )}
            </div>
          ) : null}
        </div>
        <div className="flex items-center -mr-2">
          {collectionItem && item ? (
            <CollectionItemForm
              renderTrigger={editTrigger}
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
          ) : (
            editTrigger
          )}

          {collectionItem && item ? (
            <AddToListsDialog
              targets={[{ type: "collectionItem", id: collectionItem.id }]}
              targetTitle={item.title}
              renderTrigger={listTrigger}
            />
          ) : (
            listTrigger
          )}

          {collectionItem && item ? (
            <UnifiedItemMoveForm
              renderTrigger={moveTrigger}
              selectedItems={{
                collectionIds: new Set([collectionItem.id]),
                orderIds: collectionItem.orderId
                  ? new Set([collectionItem.orderId])
                  : new Set<string>(),
              }}
              onMoveToExisting={onMoveToExisting}
              onMoveToNew={onMoveToNew}
              currency={currency}
              intent={collectionItem.orderId ? "move" : "add"}
            />
          ) : (
            moveTrigger
          )}

          {collectionItem && item ? (
            <ConfirmDialog
              renderTrigger={deleteTrigger}
              title="Delete item?"
              description="This will permanently remove this item from your collection."
              onConfirm={() => onDelete(new Set([collectionItem.id]))}
            />
          ) : (
            deleteTrigger
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <DetailRow label="Count" animateValue>
          {collectionItem ? collectionItem.count : <Skeleton className="h-5 w-6" />}
        </DetailRow>
        <DetailRow label="Price" animateValue>
          {collectionItem ? (
            formatCurrencyFromMinorUnits(collectionItem.price, currency, locale)
          ) : (
            <Skeleton className="h-5 w-16" />
          )}
        </DetailRow>
        <DetailRow label="Condition" animateValue>
          {collectionItem ? collectionItem.condition : <Skeleton className="h-5 w-14" />}
        </DetailRow>
        {(!collectionItem || collectionItem.shop) && (
          <DetailRow label="Shop" animateRow>
            {collectionItem ? collectionItem.shop : <Skeleton className="h-5 w-24" />}
          </DetailRow>
        )}
        <DetailRow label="Shipping" animateValue>
          {collectionItem ? collectionItem.shippingMethod : <Skeleton className="h-5 w-20" />}
        </DetailRow>
      </div>

      {(!collectionItem || activeStep > 0) && (
        <Timeline orientation="horizontal" value={activeStep} className="animate-data-in">
          {timelineSteps.map(({ step, title, date }) => (
            <TimelineItem key={step} step={step}>
              <TimelineIndicator />
              <TimelineSeparator />
              <TimelineHeader>
                <TimelineTitle>{title}</TimelineTitle>
                {collectionItem ? (
                  <TimelineDate>{formatDateOnlyForDisplay(date, dateFormat)}</TimelineDate>
                ) : (
                  <Skeleton className="mb-1 h-4 w-16" />
                )}
              </TimelineHeader>
            </TimelineItem>
          ))}
        </Timeline>
      )}

      {hasExtras && (
        <div className="flex flex-col gap-3">
          {(!collectionItem || hasScore) && (
            <DetailRow label="Score" animateRow>
              {collectionItem ? collectionItem.score : <Skeleton className="h-5 w-8" />}
            </DetailRow>
          )}
          {(!collectionItem || collectionItem.tags.length > 0) && (
            <div className="animate-data-in flex items-start justify-between gap-4 text-sm">
              <span className="text-muted-foreground shrink-0">Tags</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {collectionItem ? (
                  collectionItem.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" size="sm">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <Skeleton className="h-4.5 w-20 rounded-sm" />
                )}
              </div>
            </div>
          )}
          {(!collectionItem || collectionItem.notes) && (
            <div className="animate-data-in flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">Notes</span>
              <div className="text-sm leading-relaxed text-foreground/75 whitespace-pre-wrap">
                {collectionItem ? collectionItem.notes : <Skeleton className="h-10 w-full" />}
              </div>
            </div>
          )}
        </div>
      )}

      {relatedOrder && (
        <Link
          to="/orders/$id"
          params={{ id: relatedOrder.id }}
          className="animate-data-in text-sm text-primary hover:underline"
        >
          View order: {relatedOrder.title}
        </Link>
      )}
    </div>
  );
}
