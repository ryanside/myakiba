import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  ArrowLeft01Icon,
  Delete01Icon,
  Edit01Icon,
  Loading03Icon,
  MoveIcon,
  Package01Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { app, getErrorMessage } from "@/lib/treaty-client";
import { Button } from "@/components/ui/button";
import { Badge, ThemedBadge } from "@/components/reui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { formatDateOnlyForDisplay, formatRelativeTimeToNow } from "@/lib/date-display";
import CollectionItemForm from "@/components/collection/collection-item-form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CollectionItemFormValues, CollectionItem } from "@myakiba/contracts/collection/types";
import { deleteCollectionItems, updateCollectionItem } from "@/queries/collection";
import { toast } from "sonner";
import Loader from "@/components/loader";
import { getCategoryColor } from "@/lib/category-colors";
import { Card, CardHeader, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import UnifiedItemMoveForm from "@/components/orders/unified-item-move-form";
import {
  Timeline,
  TimelineItem,
  TimelineHeader,
  TimelineDate,
  TimelineTitle,
  TimelineIndicator,
  TimelineSeparator,
} from "@/components/reui/timeline";
import { getStatusVariant } from "@/lib/orders";
import { formatReleaseDate } from "@/lib/locale";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useCollectionOrderMutations } from "@/hooks/use-collection";

type ItemRelatedCollection = {
  collection: Omit<
    CollectionItem,
    "itemCategory" | "itemScale" | "createdAt" | "updatedAt" | "totalCount" | "totalValue"
  >[];
};

export const Route = createFileRoute("/(app)/items_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      {
        name: "description",
        content: `item ${params.id} details`,
      },
      {
        title: `Item ${params.id} - myakiba`,
      },
    ],
  }),
});

async function getItem(itemId: string) {
  const { data, error } = await app.api.items({ itemId }).get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get item"));
  }
  return data;
}

async function getItemRelatedOrders(itemId: string) {
  const { data, error } = await app.api.items({ itemId }).orders.get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get item related orders"));
  }
  return data;
}

async function getItemRelatedCollection(itemId: string) {
  const { data, error } = await app.api.items({ itemId }).collection.get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get item related collection"));
  }
  return data;
}

async function getResyncStatus(itemId: string) {
  const { data, error } = await app.api.items({ itemId })["resync-status"].get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get resync status"));
  }
  return data;
}

async function requestResync(itemId: string) {
  const { data, error } = await app.api.items({ itemId }).resync.post();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to request resync"));
  }
  return data;
}

function getTimelineActiveStep(dates: {
  readonly orderDate: string | null;
  readonly paymentDate: string | null;
  readonly shippingDate: string | null;
  readonly collectionDate: string | null;
}): number {
  if (dates.collectionDate) return 4;
  if (dates.shippingDate) return 3;
  if (dates.paymentDate) return 2;
  if (dates.orderDate) return 1;
  return 0;
}

function SectionHeading({ children }: { readonly children: React.ReactNode }) {
  return <h2 className="text-xs font-medium text-muted-foreground">{children}</h2>;
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

type ResyncStatus = "idle" | "requested" | "processing" | "cooldown";

const RESYNC_LABELS: Readonly<Record<ResyncStatus, string>> = {
  idle: "Update data",
  requested: "Update requested",
  processing: "Updating now",
  cooldown: "Recently updated",
};

function formatCooldownRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) return `${days}d ${remainingHours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.ceil(ms / (1000 * 60));
  return `${minutes}m`;
}

function ResyncButton({
  status,
  isPending,
  cooldownExpiresAt,
  onRequest,
}: {
  readonly status: ResyncStatus;
  readonly isPending: boolean;
  readonly cooldownExpiresAt: string | null;
  readonly onRequest: () => void;
}) {
  const isDisabled = status !== "idle" || isPending;
  const buttonLabel = isPending ? "Requesting..." : RESYNC_LABELS[status];
  const showCooldownTooltip = status === "cooldown" && cooldownExpiresAt !== null;
  const cooldownRemaining = cooldownExpiresAt ? formatCooldownRemaining(cooldownExpiresAt) : "";

  const button = (
    <Button variant="ghost" size="xs" disabled={isDisabled} onClick={onRequest} className="gap-1.5">
      <HugeiconsIcon
        icon={isPending ? Loading03Icon : Refresh01Icon}
        className={cn("size-3", isPending && "animate-spin")}
      />
      {buttonLabel}
    </Button>
  );

  if (showCooldownTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-default">{button}</span>} />
        <TooltipContent>
          {cooldownRemaining ? `Available again in ${cooldownRemaining}` : RESYNC_LABELS.cooldown}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

function RouteComponent() {
  const { currency: userCurrency, locale: userLocale, dateFormat } = useUserPreferences();
  const queryClient = useQueryClient();
  const { id } = useParams({ from: "/(app)/items_/$id" });
  const {
    handleAddCollectionItemsToOrder,
    handleAddCollectionItemsToNewOrder,
    isCollectionOrderPending,
  } = useCollectionOrderMutations();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["item", id],
    queryFn: () => getItem(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const { data: resyncStatusData } = useQuery({
    queryKey: ["item", id, "resyncStatus"],
    queryFn: () => getResyncStatus(id),
    staleTime: 1000 * 30,
    retry: false,
  });

  const requestResyncMutation = useMutation({
    mutationFn: () => requestResync(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["item", id, "resyncStatus"] });
      toast.success("Update requested");
    },
    onError: (mutationError) => {
      toast.error("Failed to request update", {
        description: mutationError.message,
      });
    },
  });

  const { data: itemRelatedOrders } = useQuery({
    queryKey: ["item", id, "itemRelatedOrders"],
    queryFn: () => getItemRelatedOrders(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const {
    data: itemRelatedCollection,
    isPending: isPendingItemRelatedCollection,
    isError: isErrorItemRelatedCollection,
    error: errorItemRelatedCollection,
  } = useQuery({
    queryKey: ["item", id, "itemRelatedCollection"],
    queryFn: () => getItemRelatedCollection(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const editCollectionItemMutation = useMutation({
    mutationFn: (values: CollectionItemFormValues) => updateCollectionItem(values),
    onMutate: async (values) => {
      await queryClient.cancelQueries({
        queryKey: ["item", id, "itemRelatedCollection"],
      });
      const previousData = queryClient.getQueryData(["item", id, "itemRelatedCollection"]);
      queryClient.setQueryData(
        ["item", id, "itemRelatedCollection"],
        (old: ItemRelatedCollection) => ({
          ...old,
          collection: old.collection.map((collectionItem) => {
            if (collectionItem.id === values.id) {
              return {
                ...collectionItem,
                status: values.status,
                count: values.count,
                score: values.score,
                price: values.price,
                shop: values.shop,
                condition: values.condition,
                orderDate: values.orderDate,
                paymentDate: values.paymentDate,
                shippingDate: values.shippingDate,
                collectionDate: values.collectionDate,
                shippingMethod: values.shippingMethod,
                notes: values.notes,
                tags: values.tags,
                releaseId: values.releaseId,
              };
            }
            return collectionItem;
          }),
        }),
      );
      return { previousData };
    },
    onSuccess: () => {},
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["item", id, "itemRelatedCollection"], context.previousData);
      }
      toast.error("Failed to update collection item. Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const deleteCollectionItemMutation = useMutation({
    mutationFn: (collectionId: string) => deleteCollectionItems([collectionId]),
    onMutate: async (collectionId) => {
      await queryClient.cancelQueries({
        queryKey: ["item", id, "itemRelatedCollection"],
      });
      const previousData = queryClient.getQueryData(["item", id, "itemRelatedCollection"]);
      queryClient.setQueryData(
        ["item", id, "itemRelatedCollection"],
        (old: ItemRelatedCollection) => ({
          ...old,
          collection: old.collection.filter((collectionItem) => collectionItem.id !== collectionId),
        }),
      );
      return { previousData };
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["item", id, "itemRelatedCollection"], context.previousData);
      }
      toast.error("Failed to delete collection item(s). Please try again.", {
        description: `Error: ${error.message}`,
      });
    },
    onSuccess: () => {},
    onSettled: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const handleEditCollectionItem = async (values: CollectionItemFormValues): Promise<void> => {
    await editCollectionItemMutation.mutateAsync(values);
  };

  const handleDeleteCollectionItem = async (collectionId: string): Promise<void> => {
    await deleteCollectionItemMutation.mutateAsync(collectionId);
  };

  if (isPending) {
    return <Loader />;
  }

  if (isError) {
    console.error(error);
    return (
      <div className="flex flex-col items-center justify-center gap-y-4">
        <Button
          variant="link"
          size="sm"
          render={<Link to="/collection" />}
          nativeButton={false}
          className="self-start"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            data-icon="inline-start"
            aria-hidden="true"
          />
          Back to Collection
        </Button>
        <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
      </div>
    );
  }

  const { item } = data;
  const collectionItems = itemRelatedCollection?.collection ?? [];
  const ordersList = itemRelatedOrders?.orders ?? [];

  const entriesByCategory = item.entries.reduce(
    (acc, entry) => {
      if (!acc[entry.category]) {
        acc[entry.category] = [];
      }
      acc[entry.category].push(entry);
      return acc;
    },
    {} as Record<string, typeof item.entries>,
  );

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="link"
        size="sm"
        render={<Link to="/collection" />}
        nativeButton={false}
        className="self-start"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          strokeWidth={2}
          data-icon="inline-start"
          aria-hidden="true"
        />
        Back to Collection
      </Button>

      {/* Hero: Image + Item Identity */}
      <div className="flex flex-col sm:flex-row gap-6">
        {item.image && (
          <div className="w-44 h-60 shrink-0 overflow-hidden rounded-xl bg-muted/40">
            <img
              src={item.image}
              alt={item.title}
              className="h-full w-full object-cover object-top"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex flex-col items-start justify-center gap-2">
          <h1 className="text-2xl font-medium tracking-tight">{item.title}</h1>
          {item.externalId ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <a
                href={`https://myfigurecollection.net/item/${item.externalId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                myfigurecollection.net/item/{item.externalId}
              </a>
              {item.updatedAt && (
                <>
                  <span className="hidden sm:inline text-xs text-muted-foreground/50">·</span>
                  <span className="text-xs text-muted-foreground/70">
                    Updated {formatRelativeTimeToNow(new Date(item.updatedAt))}
                  </span>
                </>
              )}
              {item.source === "mfc" && item.externalId && (
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-xs text-muted-foreground/50">·</span>
                  <span className="text-xs text-muted-foreground/70">Item info outdated?</span>
                  <ResyncButton
                    status={resyncStatusData?.status ?? "idle"}
                    isPending={requestResyncMutation.isPending}
                    cooldownExpiresAt={resyncStatusData?.cooldownExpiresAt ?? null}
                    onRequest={() => requestResyncMutation.mutate()}
                  />
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Custom item</span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              style={{
                borderColor: getCategoryColor(item.category),
                color: getCategoryColor(item.category),
              }}
            >
              {item.category}
            </Badge>
            {item.scale && item.scale !== "NON_SCALE" && (
              <Badge variant="outline">{item.scale}</Badge>
            )}
            {item.version && item.version.length > 0 && (
              <Badge variant="outline">{item.version}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 border-border/50">
        {/* Left Column: Item Details */}
        <div className="lg:col-span-3 space-y-10 border-border/50 lg:pr-6 py-8">
          {/* Releases */}
          {item.releases && item.releases.length > 0 && (
            <section className="space-y-2">
              <SectionHeading>Releases</SectionHeading>
              <div className="space-y-2">
                {item.releases.map((release) => (
                  <div
                    key={release.id}
                    className="flex items-center gap-3 text-sm py-2 last:pb-0 border-b border-border/50 last:border-0"
                  >
                    <HugeiconsIcon
                      icon={Calendar01Icon}
                      className="size-4 text-muted-foreground shrink-0"
                    />
                    <span className="font-medium">
                      {formatDateOnlyForDisplay(release.date, dateFormat)}
                    </span>
                    {release.type && <Badge variant="secondary">{release.type}</Badge>}
                    {release.barcode && (
                      <span className="text-xs text-muted-foreground">{release.barcode}</span>
                    )}
                    {release.price != null &&
                      release.price > 0 &&
                      release.priceCurrency?.trim() && (
                        <span className="ml-auto font-medium tabular-nums">
                          {formatReleaseDate(release.price, release.priceCurrency, userCurrency)}
                        </span>
                      )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Related Entries */}
          {Object.keys(entriesByCategory).length > 0 && (
            <section className="space-y-2">
              {Object.entries(entriesByCategory).map(([category, entries]) => (
                <div key={category}>
                  <span className="text-xs font-medium text-muted-foreground">{category}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {entries.map((entry) => (
                      <Badge key={entry.id} variant="secondary">
                        {entry.name}
                        {entry.role && (
                          <span className="text-muted-foreground ml-1">({entry.role})</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Specifications */}
          <section className="space-y-2">
            <SectionHeading>Specifications</SectionHeading>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {item.scale && (
                <div>
                  <span className="text-xs text-muted-foreground">Scale</span>
                  <p className="text-sm font-medium mt-0.5">{item.scale}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">Height</span>
                <p className="text-sm font-medium mt-0.5">
                  {item.height ? `${item.height}mm` : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Width</span>
                <p className="text-sm font-medium mt-0.5">{item.width ? `${item.width}mm` : "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Depth</span>
                <p className="text-sm font-medium mt-0.5">{item.depth ? `${item.depth}mm` : "—"}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Your Collection */}
        <div className="lg:col-span-2 lg:pl-6 py-8 border-t border-border lg:border-t-0">
          <SectionHeading>Your Collection</SectionHeading>

          <div className="mt-4">
            {isPendingItemRelatedCollection ? (
              <div className="flex items-center justify-center py-12">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="size-5 animate-spin text-muted-foreground"
                />
              </div>
            ) : isErrorItemRelatedCollection ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Package01Icon} />
                  </EmptyMedia>
                  <EmptyTitle>Error Loading Collection</EmptyTitle>
                  <EmptyDescription>{errorItemRelatedCollection.message}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : collectionItems.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 px-6 text-center">
                <p className="text-sm text-muted-foreground">Not in your collection yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {collectionItems.map((collectionItem) => {
                  const release = item.releases.find((r) => r.id === collectionItem.releaseId);
                  const relatedOrder = collectionItem.orderId
                    ? ordersList.find((o) => o.id === collectionItem.orderId)
                    : undefined;
                  const isOrderActionPending = isCollectionOrderPending(collectionItem.id);
                  const activeStep = getTimelineActiveStep({
                    orderDate: collectionItem.orderDate,
                    paymentDate: collectionItem.paymentDate,
                    shippingDate: collectionItem.shippingDate,
                    collectionDate: collectionItem.collectionDate,
                  });

                  return (
                    <Card key={collectionItem.id}>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <ThemedBadge variant={getStatusVariant(collectionItem.status)}>
                            {collectionItem.status}
                          </ThemedBadge>
                          {release && (
                            <span className="text-xs text-muted-foreground">
                              {formatDateOnlyForDisplay(release.date, dateFormat)}
                            </span>
                          )}
                        </div>
                        <CardAction>
                          <div className="flex items-center gap-1">
                            <CollectionItemForm
                              renderTrigger={
                                <Button variant="ghost" size="icon">
                                  <HugeiconsIcon icon={Edit01Icon} className="size-4" />
                                </Button>
                              }
                              itemData={{
                                ...collectionItem,
                                id: collectionItem.id,
                                itemExternalId: item.externalId ?? null,
                                itemTitle: item.title,
                                itemImage: item.image,
                                releaseDate: release?.date ?? null,
                                releasePrice: release?.price ?? null,
                                releaseCurrency: release?.priceCurrency ?? null,
                                releaseBarcode: release?.barcode ?? null,
                                releaseType: release?.type ?? null,
                              }}
                              callbackFn={handleEditCollectionItem}
                              currency={userCurrency}
                              dateFormat={dateFormat}
                            />
                            <UnifiedItemMoveForm
                              renderTrigger={
                                <Button variant="ghost" size="icon" disabled={isOrderActionPending}>
                                  <HugeiconsIcon
                                    icon={isOrderActionPending ? Loading03Icon : MoveIcon}
                                    className={cn("size-4", isOrderActionPending && "animate-spin")}
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
                              onMoveToExisting={handleAddCollectionItemsToOrder}
                              onMoveToNew={handleAddCollectionItemsToNewOrder}
                              clearSelections={() => {}}
                              currency={userCurrency}
                              intent="add"
                            />
                            <Popover>
                              <PopoverTrigger
                                render={
                                  <Button variant="ghost" size="icon">
                                    <HugeiconsIcon icon={Delete01Icon} className="size-4" />
                                  </Button>
                                }
                              />
                              <PopoverContent>
                                <div className="flex flex-col gap-3">
                                  <p className="text-sm">Delete this collection item?</p>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="destructive"
                                      onClick={() => handleDeleteCollectionItem(collectionItem.id)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </CardAction>
                      </CardHeader>

                      <CardContent className="space-y-5">
                        <div className="space-y-1.5">
                          <DetailRow label="Count">{collectionItem.count}</DetailRow>
                          <DetailRow label="Price">
                            {formatCurrencyFromMinorUnits(
                              collectionItem.price,
                              userCurrency,
                              userLocale,
                            )}
                          </DetailRow>
                          <DetailRow label="Condition">{collectionItem.condition}</DetailRow>
                          {collectionItem.shop && (
                            <DetailRow label="Shop">{collectionItem.shop}</DetailRow>
                          )}
                          <DetailRow label="Shipping Method">
                            {collectionItem.shippingMethod}
                          </DetailRow>
                        </div>

                        {activeStep > 0 && (
                          <Timeline orientation="vertical" value={activeStep}>
                            <TimelineItem step={1}>
                              <TimelineIndicator />
                              <TimelineSeparator />
                              <TimelineHeader>
                                <TimelineTitle>Ordered</TimelineTitle>
                                <TimelineDate>
                                  {formatDateOnlyForDisplay(collectionItem.orderDate, dateFormat)}
                                </TimelineDate>
                              </TimelineHeader>
                            </TimelineItem>
                            <TimelineItem step={2}>
                              <TimelineIndicator />
                              <TimelineSeparator />
                              <TimelineHeader>
                                <TimelineTitle>Paid</TimelineTitle>
                                <TimelineDate>
                                  {formatDateOnlyForDisplay(collectionItem.paymentDate, dateFormat)}
                                </TimelineDate>
                              </TimelineHeader>
                            </TimelineItem>
                            <TimelineItem step={3}>
                              <TimelineIndicator />
                              <TimelineSeparator />
                              <TimelineHeader>
                                <TimelineTitle>Shipped</TimelineTitle>
                                <TimelineDate>
                                  {formatDateOnlyForDisplay(
                                    collectionItem.shippingDate,
                                    dateFormat,
                                  )}
                                </TimelineDate>
                              </TimelineHeader>
                            </TimelineItem>
                            <TimelineItem step={4}>
                              <TimelineIndicator />
                              <TimelineSeparator />
                              <TimelineHeader>
                                <TimelineTitle>Collected</TimelineTitle>
                                <TimelineDate>
                                  {formatDateOnlyForDisplay(
                                    collectionItem.collectionDate,
                                    dateFormat,
                                  )}
                                </TimelineDate>
                              </TimelineHeader>
                            </TimelineItem>
                          </Timeline>
                        )}

                        {(collectionItem.score ||
                          collectionItem.tags.length > 0 ||
                          collectionItem.notes) && (
                          <div className="space-y-3">
                            {collectionItem.score && parseFloat(collectionItem.score) !== 0 && (
                              <DetailRow label="Score">{collectionItem.score}</DetailRow>
                            )}
                            {collectionItem.tags.length > 0 && (
                              <div>
                                <span className="text-xs text-muted-foreground">Tags</span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {collectionItem.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {collectionItem.notes && (
                              <div>
                                <span className="text-xs text-muted-foreground">Notes</span>
                                <p className="text-sm mt-1 text-foreground/80 whitespace-pre-wrap">
                                  {collectionItem.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>

                      {relatedOrder && (
                        <CardFooter>
                          <Link
                            to="/orders/$id"
                            params={{ id: collectionItem.orderId! }}
                            className="flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
                          >
                            <span>View order: {relatedOrder.title}</span>
                          </Link>
                        </CardFooter>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
