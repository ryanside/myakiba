import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { app, getErrorMessage } from "@/lib/treaty-client";
import { addRecentItem } from "@/lib/recent-items";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package2, Calendar, Edit, Trash, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { formatCurrencyFromMinorUnits, formatDate, getCategoryColor } from "@myakiba/utils";
import { Label } from "@/components/ui/label";
import CollectionItemForm from "@/components/collection/collection-item-form";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CollectionItemFormValues } from "@/lib/collection/types";
import { deleteCollectionItems, updateCollectionItem } from "@/queries/collection";
import { toast } from "sonner";
import type { ItemRelatedCollection } from "@/lib/items/types";
import Loader from "@/components/loader";
import type { DateFormat } from "@myakiba/types";

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

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency;
  const dateFormat = session?.user.dateFormat as DateFormat;
  const queryClient = useQueryClient();
  const { id } = useParams({ from: "/(app)/items_/$id" });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["item", id],
    queryFn: () => getItem(id),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const {
    data: itemRelatedOrders,
    // isPending: isPendingItemRelatedOrders,
    // isError: isErrorItemRelatedOrders,
    // error: errorItemRelatedOrders,
  } = useQuery({
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
        (old: ItemRelatedCollection) => {
          return {
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
          };
        },
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["item", id, "itemRelatedCollection"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["item", id, "itemRelatedOrders"],
        }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
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
        (old: ItemRelatedCollection) => {
          return {
            ...old,
            collection: old.collection.filter(
              (collectionItem) => collectionItem.id !== collectionId,
            ),
          };
        },
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["item", id, "itemRelatedCollection"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["item", id, "itemRelatedOrders"],
        }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: ["collection"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      ]);
    },
  });

  const handleEditCollectionItem = async (values: CollectionItemFormValues) => {
    await editCollectionItemMutation.mutateAsync(values);
  };

  const handleDeleteCollectionItem = async (collectionId: string) => {
    await deleteCollectionItemMutation.mutateAsync(collectionId);
  };

  useEffect(() => {
    if (data?.item) {
      addRecentItem({
        id: data.item.id,
        type: "collection",
        title: data.item.title,
        images: data.item.image ? [data.item.image] : [],
      });
    }
  }, [data?.item]);

  if (isPending) {
    return <Loader />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-y-4">
        <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        <Button asChild variant="outline">
          <Link to="/collection">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Collection
          </Link>
        </Button>
      </div>
    );
  }

  const { item } = data;

  const collectionItems = itemRelatedCollection?.collection || [];
  const ordersList = itemRelatedOrders?.orders || [];

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
        <Card className="lg:col-span-2 border-none bg-background rounded-none shadow-none">
          <CardContent className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6">
              {item.image && (
                <div className="">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-32 h-32 object-cover object-top rounded-lg border"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="flex-1 h-full space-y-2">
                <div className="flex flex-col gap-y-0.5">
                  <h1 className="text-xl font-semibold ">{item.title}</h1>
                  {item.externalId ? (
                    <a
                      href={`https://myfigurecollection.net/item/${item.externalId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground font-light hover:text-foreground transition-colors underline-offset-4 hover:underline"
                    >
                      https://myfigurecollection.net/item/{item.externalId}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground font-light">Custom item</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
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

            {/* Releases */}
            {item.releases && item.releases.length > 0 && (
              <div>
                <Label className="text-sm font-semibold mb-3">Releases</Label>
                <div className="space-y-2">
                  {item.releases.map((release) => (
                    <div
                      key={release.id}
                      className="flex flex-wrap items-center gap-2 text-sm p-3 border rounded-lg"
                    >
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{formatDate(release.date, dateFormat)}</span>
                      {release.type && (
                        <Badge variant="outline" className="text-xs">
                          {release.type}
                        </Badge>
                      )}
                      {release.barcode && (
                        <Badge appearance="ghost" variant="outline" className="text-xs">
                          {release.barcode}
                        </Badge>
                      )}
                      {release.price && release.priceCurrency && (
                        <span className="ml-auto font-medium">
                          {formatCurrencyFromMinorUnits(release.price, release.priceCurrency)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Entries (Characters, Companies, etc.) */}
            <div>
              <Label className="text-sm font-semibold mb-3">Related Entries</Label>
              <div className="space-y-3">
                {Object.entries(
                  item.entries.reduce(
                    (acc, entry) => {
                      if (!acc[entry.category]) {
                        acc[entry.category] = [];
                      }
                      acc[entry.category].push(entry);
                      return acc;
                    },
                    {} as Record<string, typeof item.entries>,
                  ),
                ).map(([category, entries]) => (
                  <div key={category}>
                    <Label className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      {category}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {entries.map((entry) => (
                        <Badge key={entry.id} variant="outline">
                          {entry.name}
                          {entry.role && <span className="text-xs">({entry.role})</span>}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                <div key="dimensions">
                  <Label className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    Dimensions
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {item.scale && <Badge variant="outline">{item.scale}</Badge>}

                    <Badge variant="outline">
                      Height: {item.height ? `${item.height}mm` : "N/A"}
                    </Badge>
                    <Badge variant="outline">Width: {item.width ? `${item.width}mm` : "N/A"}</Badge>
                    <Badge variant="outline">Depth: {item.depth ? `${item.depth}mm` : "N/A"}</Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col shadow-none">
          <CardHeader className="">
            <CardTitle>Personal</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 px-4 overflow-y-auto">
            {isPendingItemRelatedCollection ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin" />
              </div>
            ) : isErrorItemRelatedCollection ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Package2 />
                  </EmptyMedia>
                  <EmptyTitle>Error Loading Collection</EmptyTitle>
                  <EmptyDescription>{errorItemRelatedCollection.message}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : collectionItems.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Package2 />
                  </EmptyMedia>
                  <EmptyTitle>No Collection Items</EmptyTitle>
                  <EmptyDescription>
                    You don't have this item in your collection yet.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-4">
                {collectionItems.map((collectionItem) => {
                  const release = data.item.releases.find(
                    (releaseItem) => releaseItem.id === collectionItem.releaseId,
                  );
                  const relatedOrder = collectionItem.orderId
                    ? ordersList.find((order) => order.id === collectionItem.orderId)
                    : undefined;

                  return (
                    <Card key={collectionItem.id} className="shadow-none bg-background">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Badge variant="primary">{collectionItem.status}</Badge>
                          <div className="ml-auto">
                            <CollectionItemForm
                              renderTrigger={
                                <Button variant="ghost" size="icon" className="">
                                  <Edit className="" />
                                </Button>
                              }
                              itemData={{
                                ...collectionItem,
                                id: collectionItem.id,
                                itemExternalId: data.item.externalId ?? null,
                                itemTitle: data.item.title,
                                itemImage: data.item.image,
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
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash className="" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <div className="flex flex-col gap-3">
                                  <p className="text-sm">Delete this collection item?</p>
                                  <div className="flex justify-end gap-2">
                                    <PopoverClose asChild>
                                      <Button variant="outline" size="sm">
                                        Cancel
                                      </Button>
                                    </PopoverClose>
                                    <PopoverClose asChild>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() =>
                                          handleDeleteCollectionItem(collectionItem.id)
                                        }
                                      >
                                        Delete
                                      </Button>
                                    </PopoverClose>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Count</span>
                            <span className="text-foreground font-medium">
                              {collectionItem.count}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Price</span>
                            <span className="text-foreground font-medium">
                              {formatCurrencyFromMinorUnits(collectionItem.price, userCurrency)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Condition</span>
                            <span className="text-foreground font-medium">
                              {collectionItem.condition}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Shop</span>
                            <span className="text-foreground font-medium">
                              {collectionItem.shop || "n/a"}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Shipping Method</span>
                            <span className="text-foreground font-medium">
                              {collectionItem.shippingMethod}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Release</span>
                            <span className="text-foreground font-medium">
                              {formatDate(release?.date, dateFormat)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Order Date</span>
                            <span className="text-foreground font-medium">
                              {formatDate(collectionItem.orderDate, dateFormat)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Payment Date</span>
                            <span className="text-foreground font-medium">
                              {formatDate(collectionItem.paymentDate, dateFormat)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Shipping Date</span>
                            <span className="text-foreground font-medium">
                              {formatDate(collectionItem.shippingDate, dateFormat)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Collection Date</span>
                            <span className="text-foreground font-medium">
                              {formatDate(collectionItem.collectionDate, dateFormat)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Score</span>
                            <span className="text-right text-foreground font-medium">
                              {collectionItem.score || "n/a"}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Tags</span>
                            <span className="text-right text-foreground font-medium">
                              {collectionItem.tags.join(", ") || "n/a"}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-sm items-center">
                            <span>Notes</span>
                            <span className="text-right max-w-[60%] text-foreground font-medium">
                              {collectionItem.notes || "n/a"}
                            </span>
                          </div>
                        </div>
                        {collectionItem.orderId && (
                          <div className="mt-4">
                            <Accordion type="single" collapsible>
                              <AccordionItem value="item-1">
                                <AccordionTrigger className="text-sm">
                                  Related Order
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-3 pt-2">
                                    <div className="flex justify-between text-muted-foreground text-sm items-center">
                                      <span>Order</span>
                                      <Link
                                        to={`/orders/$id`}
                                        params={{
                                          id: collectionItem.orderId,
                                        }}
                                        className="text-primary hover:underline"
                                      >
                                        {relatedOrder?.title}
                                      </Link>
                                    </div>
                                    {relatedOrder?.shop && (
                                      <div className="flex justify-between text-muted-foreground text-sm items-center">
                                        <span>Shop</span>
                                        <span className="text-foreground font-medium">
                                          {relatedOrder.shop}
                                        </span>
                                      </div>
                                    )}
                                    {relatedOrder?.releaseDate && (
                                      <div className="flex justify-between text-muted-foreground text-sm items-center">
                                        <span>Release</span>
                                        <span className="text-foreground font-medium">
                                          {formatDate(relatedOrder.releaseDate, dateFormat)}
                                        </span>
                                      </div>
                                    )}
                                    {relatedOrder?.shippingFee && (
                                      <div className="flex justify-between text-muted-foreground text-sm items-center">
                                        <span>Shipping Fee</span>
                                        <span className="text-foreground font-medium">
                                          {formatCurrencyFromMinorUnits(
                                            relatedOrder.shippingFee || 0,
                                            userCurrency,
                                          )}
                                        </span>
                                      </div>
                                    )}
                                    {relatedOrder?.taxes && (
                                      <div className="flex justify-between text-muted-foreground text-sm items-center">
                                        <span>Taxes</span>
                                        <span className="text-foreground font-medium">
                                          {formatCurrencyFromMinorUnits(
                                            relatedOrder.taxes || 0,
                                            userCurrency,
                                          )}
                                        </span>
                                      </div>
                                    )}
                                    {relatedOrder?.duties && (
                                      <div className="flex justify-between text-muted-foreground text-sm items-center">
                                        <span>Duties</span>
                                        <span className="text-foreground font-medium">
                                          {formatCurrencyFromMinorUnits(
                                            relatedOrder.duties || 0,
                                            userCurrency,
                                          )}
                                        </span>
                                      </div>
                                    )}
                                    {relatedOrder?.tariffs && (
                                      <div className="flex justify-between text-muted-foreground text-sm items-center">
                                        <span>Tariffs</span>
                                        <span className="text-foreground font-medium">
                                          {formatCurrencyFromMinorUnits(
                                            relatedOrder.tariffs || 0,
                                            userCurrency,
                                          )}
                                        </span>
                                      </div>
                                    )}
                                    {relatedOrder?.miscFees && (
                                      <div className="flex justify-between text-muted-foreground text-sm items-center">
                                        <span>Misc Fees</span>
                                        <span className="text-foreground font-medium">
                                          {formatCurrencyFromMinorUnits(
                                            relatedOrder.miscFees || 0,
                                            userCurrency,
                                          )}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
