import type { CollectionItemFormValues } from "@/lib/collection/types";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "../ui/button";
import { Input } from "@/components/ui/input";
import { MaskInput } from "@/components/ui/mask-input";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { getItemReleases } from "@/queries/orders";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import * as z from "zod";
import { Textarea } from "../ui/textarea";
import { Rating } from "../ui/rating";
import { Field, FieldContent, FieldTitle } from "@/components/ui/field";
import { Badge } from "../ui/badge";
import { X } from "lucide-react";
import { getCurrencyLocale } from "@/lib/utils";
import { Scroller } from "../ui/scroller";

type CollectionItemFormProps = {
  itemData: CollectionItemFormValues;
  callbackFn: (itemData: CollectionItemFormValues) => void;
  currency?: string;
};

export default function CollectionItemForm(props: CollectionItemFormProps) {
  const { itemData, callbackFn, currency } = props;

  const userCurrency = currency || "USD";
  const userLocale = getCurrencyLocale(userCurrency);

  const form = useForm({
    defaultValues: itemData,
    onSubmit: ({ value }) => {
      callbackFn(value);
    },
  });

  const {
    data: releasesData,
    isLoading: releasesLoading,
    error: releasesError,
    refetch: refetchReleases,
  } = useQuery({
    queryKey: ["itemReleases", itemData.itemId],
    queryFn: () => getItemReleases(itemData.itemId),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: false,
  });

  return (
    <SheetContent side="right" className="w-full sm:max-w-lg h-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <SheetHeader>
          <SheetTitle>Edit Item</SheetTitle>
          <SheetDescription>{itemData.itemTitle}</SheetDescription>
        </SheetHeader>
        <Scroller className="max-h-[70vh] px-2">
          <div className="grid gap-4 p-2">
            {/* Price, Count, Score */}
            <div className="grid grid-cols-2 gap-4">
              <form.Field
                name="price"
                validators={{
                  onChange: z.string().nonempty("Price is required"),
                }}
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Price</Label>
                    <MaskInput
                      id={field.name}
                      name={field.name}
                      mask="currency"
                      currency={userCurrency}
                      locale={userLocale}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                      placeholder="0.00"
                    />
                    {!field.state.meta.isValid && (
                      <em role="alert" className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </em>
                    )}
                  </div>
                )}
              />

              <form.Field
                name="count"
                validators={{
                  onChange: z.number().min(1, "Count must be at least 1"),
                }}
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Count</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? 1}
                      onBlur={field.handleBlur}
                      type="number"
                      min="1"
                      onChange={(e) =>
                        field.handleChange(parseInt(e.target.value) || 1)
                      }
                      placeholder="1"
                    />
                    {!field.state.meta.isValid && (
                      <em role="alert" className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </em>
                    )}
                  </div>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <form.Field
                name="condition"
                validators={{
                  onChange: z.enum(
                    ["New", "Pre-Owned"],
                    "Condition is required"
                  ),
                }}
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Condition</Label>
                    <Select
                      value={field.state.value ?? ""}
                      onValueChange={(value) =>
                        field.handleChange(value as typeof field.state.value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Pre-Owned">Pre-Owned</SelectItem>
                      </SelectContent>
                    </Select>
                    {!field.state.meta.isValid && (
                      <em role="alert" className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </em>
                    )}
                  </div>
                )}
              />
              <form.Field
                name="score"
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Score</Label>
                    <div>
                      <Rating
                        size="md"
                        rating={Number(field.state.value) ?? 0}
                        onRatingChange={(value) =>
                          field.handleChange(value.toString())
                        }
                        editable={true}
                        showValue={true}
                        maxRating={10}
                      />
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Status and Shop */}
            <div className="grid grid-cols-2 gap-4">
              <form.Field
                name="status"
                validators={{
                  onChange: z.enum(
                    ["Owned", "Ordered", "Paid", "Shipped", "Sold"],
                    "Status is required"
                  ),
                }}
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Status</Label>
                    <Select
                      value={field.state.value ?? ""}
                      onValueChange={(value) =>
                        field.handleChange(value as typeof field.state.value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Owned">Owned</SelectItem>
                        <SelectItem value="Ordered">Ordered</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Shipped">Shipped</SelectItem>
                        <SelectItem value="Sold">Sold</SelectItem>
                      </SelectContent>
                    </Select>
                    {!field.state.meta.isValid && (
                      <em role="alert" className="text-xs text-destructive">
                        {field.state.meta.errors.join(", ")}
                      </em>
                    )}
                  </div>
                )}
              />

              <form.Field
                name="shop"
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Shop</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? ""}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Shop name"
                    />
                  </div>
                )}
              />
            </div>

            {/* Release Date */}
            <form.Field
              name="releaseId"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Release Date</Label>
                  <Select
                    value={field.state.value ?? ""}
                    onValueChange={(value) =>
                      field.handleChange(value as typeof field.state.value)
                    }
                    onOpenChange={(open) => {
                      if (open) {
                        refetchReleases();
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select release">
                        {field.state.value &&
                          (() => {
                            const selectedRelease = releasesData?.releases.find(
                              (r) => r.id === field.state.value
                            );
                            const displayData = selectedRelease || {
                              date: itemData.releaseDate,
                              type: itemData.releaseType,
                              price: itemData.releasePrice,
                              priceCurrency: itemData.releaseCurrency,
                              barcode: itemData.releaseBarcode,
                            };

                            return (
                              <div className="flex items-center truncate text-xs gap-2 justify-between">
                                <div className="font-medium">
                                  {displayData.date}
                                </div>
                                <div className="text-muted-foreground">
                                  {displayData.type && (
                                    <span>{displayData.type}</span>
                                  )}
                                  {displayData.price &&
                                    displayData.priceCurrency && (
                                      <span>
                                        {displayData.priceCurrency}{" "}
                                        {displayData.price}
                                      </span>
                                    )}
                                  {displayData.barcode && (
                                    <span>#{displayData.barcode}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {releasesLoading && (
                        <div className="flex items-center justify-center py-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                          <span className="ml-2 text-sm text-muted-foreground">
                            Loading releases...
                          </span>
                        </div>
                      )}
                      {releasesError && (
                        <div className="py-2 px-3 text-sm text-red-500">
                          {releasesError.message}
                        </div>
                      )}
                      {releasesData?.releases.map((release) => (
                        <SelectItem key={release.id} value={release.id}>
                          <div className="flex items-center truncate text-xs gap-2 justify-between">
                            <div className="font-medium">{release.date}</div>
                            <div className="text-muted-foreground">
                              {release.type && <span>{release.type}</span>}
                              {release.price && release.priceCurrency && (
                                <span>
                                  {release.priceCurrency} {release.price}
                                </span>
                              )}
                              {release.barcode && (
                                <span>#{release.barcode}</span>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                      {releasesData?.releases.length === 0 &&
                        !releasesLoading && (
                          <div className="py-2 px-3 text-sm text-muted-foreground">
                            No releases found
                          </div>
                        )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            {/* Date Fields */}
            <div className="grid grid-cols-2 gap-4">
              <form.Field
                name="orderDate"
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Order Date</Label>
                    <DatePicker
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? null}
                      onBlur={field.handleBlur}
                      onChange={(value) => field.handleChange(value)}
                      placeholder="Select order date"
                    />
                  </div>
                )}
              />

              <form.Field
                name="paymentDate"
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Payment Date</Label>
                    <DatePicker
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? null}
                      onBlur={field.handleBlur}
                      onChange={(value) => field.handleChange(value)}
                      placeholder="Select payment date"
                    />
                  </div>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <form.Field
                name="shippingDate"
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Shipping Date</Label>
                    <DatePicker
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? null}
                      onBlur={field.handleBlur}
                      onChange={(value) => field.handleChange(value)}
                      placeholder="Select shipping date"
                    />
                  </div>
                )}
              />
              <form.Field
                name="collectionDate"
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Collection Date</Label>
                    <DatePicker
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? null}
                      onBlur={field.handleBlur}
                      onChange={(value) => field.handleChange(value)}
                      placeholder="Select collection date"
                    />
                  </div>
                )}
              />
            </div>
            <form.Field
              name="shippingMethod"
              validators={{
                onChange: z.enum(
                  [
                    "n/a",
                    "EMS",
                    "SAL",
                    "AIRMAIL",
                    "SURFACE",
                    "FEDEX",
                    "DHL",
                    "Colissimo",
                    "UPS",
                    "Domestic",
                  ],
                  "Shipping method is required"
                ),
              }}
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Shipping Method</Label>
                  <Select
                    value={field.state.value ?? ""}
                    onValueChange={(value) =>
                      field.handleChange(value as typeof field.state.value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shipping method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="n/a">n/a</SelectItem>
                      <SelectItem value="EMS">EMS</SelectItem>
                      <SelectItem value="SAL">SAL</SelectItem>
                      <SelectItem value="AIRMAIL">AIRMAIL</SelectItem>
                      <SelectItem value="SURFACE">SURFACE</SelectItem>
                      <SelectItem value="FEDEX">FEDEX</SelectItem>
                      <SelectItem value="DHL">DHL</SelectItem>
                      <SelectItem value="Colissimo">Colissimo</SelectItem>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="Domestic">Domestic</SelectItem>
                    </SelectContent>
                  </Select>
                  {!field.state.meta.isValid && (
                    <em role="alert" className="text-xs text-destructive">
                      {field.state.meta.errors.join(", ")}
                    </em>
                  )}
                </div>
              )}
            />
            <form.Field
              name="tags"
              children={(field) => (
                <Field className="gap-2">
                  <FieldTitle>Tags</FieldTitle>
                  <FieldContent>
                    <div className="flex flex-wrap gap-2">
                      {field.state.value?.map((tag, tagIndex) => (
                        <Badge
                          key={tagIndex}
                          variant="outline"
                          size="lg"
                          className="flex items-center justify-between pr-0"
                        >
                          {tag}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const current = field.state.value || [];
                              field.handleChange(
                                current.filter((_, idx) => idx !== tagIndex)
                              );
                            }}
                            className=" hover:text-red-500 hover:bg-transparent"
                          >
                            <X />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="tags-input"
                        type="text"
                        placeholder="Press enter after each tag to add"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value) {
                              const current = field.state.value || [];
                              field.handleChange([...current, value]);
                              input.value = "";
                            }
                          }
                        }}
                      />
                    </div>
                  </FieldContent>
                </Field>
              )}
            />

            {/* Notes */}
            <form.Field
              name="notes"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Notes</Label>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Additional notes"
                  />
                </div>
              )}
            />
          </div>
        </Scroller>
        <SheetFooter className="flex flex-row w-full">
          <SheetClose asChild>
            <Button type="button" variant="outline" className="w-full flex-1">
              Cancel
            </Button>
          </SheetClose>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <SheetClose asChild>
                <Button type="submit" disabled={!canSubmit || isSubmitting} className="w-full flex-1">
                  {isSubmitting ? "Updating..." : "Update"}
                </Button>
              </SheetClose>
            )}
          />
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
