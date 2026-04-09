import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "../ui/button";
import { Input } from "@/components/ui/input";
import { MaskInput } from "@/components/ui/mask-input";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { searchReleases } from "@/queries/search";
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
import { Badge } from "@/components/reui/badge";
import { FormSection } from "@/components/ui/form-section";
import { majorStringToMinorUnits, minorUnitsToMajorString } from "@myakiba/utils/currency";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { Scroller } from "../ui/scroller";
import {
  COLLECTION_STATUSES,
  SHIPPING_METHODS,
  CONDITIONS,
} from "@myakiba/contracts/shared/constants";
import { useState, type ReactElement } from "react";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleaseDate, getCurrencyLocale } from "@/lib/locale";

type CollectionItemFormProps = {
  renderTrigger: ReactElement;
  itemData: CollectionItemFormValues;
  callbackFn: (itemData: CollectionItemFormValues) => Promise<void>;
  currency: Currency;
  dateFormat?: DateFormat;
};

export default function CollectionItemForm(props: CollectionItemFormProps) {
  const { itemData, callbackFn, currency, dateFormat, renderTrigger } = props;
  const [open, setOpen] = useState(false);

  const userLocale = getCurrencyLocale(currency);

  const form = useForm({
    defaultValues: {
      ...itemData,
      price: minorUnitsToMajorString(itemData.price ?? 0),
    },
    onSubmit: async ({ value }) => {
      const transformedValue: CollectionItemFormValues = {
        ...value,
        price: majorStringToMinorUnits(value.price),
      };
      await callbackFn(transformedValue);
      setOpen(false);
    },
  });

  const {
    data: releasesData,
    isLoading: releasesLoading,
    error: releasesError,
    refetch: refetchReleases,
  } = useQuery({
    queryKey: ["itemReleases", itemData.itemId],
    queryFn: () => searchReleases(itemData.itemId),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: false,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={renderTrigger} />
      <SheetContent side="right" className="w-full sm:max-w-lg! h-full">
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
            <div className="flex flex-col gap-3 p-2">
              <FormSection title="Basics">
                <div className="grid grid-cols-2 gap-3">
                  <form.Field
                    name="price"
                    validators={{ onChange: z.string().nonempty("Price is required") }}
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Price</Label>
                        <MaskInput
                          id={field.name}
                          name={field.name}
                          mask="currency"
                          currency={currency}
                          locale={userLocale}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onValueChange={(_maskedValue, unmaskedValue) =>
                            field.handleChange(unmaskedValue)
                          }
                          placeholder="0.00"
                        />
                        {!field.state.meta.isValid && (
                          <p role="alert" className="text-xs text-destructive">
                            {field.state.meta.errors.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  />

                  <form.Field
                    name="count"
                    validators={{ onChange: z.number().min(1, "Count must be at least 1") }}
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Count</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value ?? 1}
                          onBlur={field.handleBlur}
                          type="number"
                          min="1"
                          onChange={(e) => field.handleChange(parseInt(e.target.value) || 1)}
                          placeholder="1"
                        />
                        {!field.state.meta.isValid && (
                          <p role="alert" className="text-xs text-destructive">
                            {field.state.meta.errors.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <form.Field
                    name="status"
                    validators={{
                      onChange: z.enum(COLLECTION_STATUSES, "Status is required"),
                    }}
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Status</Label>
                        <Select
                          value={field.state.value ?? ""}
                          onValueChange={(value) =>
                            field.handleChange(value as typeof field.state.value)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            {COLLECTION_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!field.state.meta.isValid && (
                          <p role="alert" className="text-xs text-destructive">
                            {field.state.meta.errors.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  />

                  <form.Field
                    name="condition"
                    validators={{ onChange: z.enum(CONDITIONS, "Condition is required") }}
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Condition</Label>
                        <Select
                          value={field.state.value ?? ""}
                          onValueChange={(value) =>
                            field.handleChange(value as typeof field.state.value)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select condition" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((condition) => (
                              <SelectItem key={condition} value={condition}>
                                {condition}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!field.state.meta.isValid && (
                          <p role="alert" className="text-xs text-destructive">
                            {field.state.meta.errors.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  />
                </div>
              </FormSection>

              <FormSection title="Details">
                <form.Field
                  name="score"
                  children={(field) => (
                    <div className="grid gap-1.5">
                      <Label htmlFor={field.name}>Score</Label>
                      <div>
                        <Rating
                          size="md"
                          rating={Number(field.state.value) || 0}
                          onRatingChange={(value) => field.handleChange(value.toString())}
                          editable={true}
                          showValue={true}
                          maxRating={10}
                        />
                      </div>
                    </div>
                  )}
                />

                <form.Field
                  name="shop"
                  children={(field) => (
                    <div className="grid gap-1.5">
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

                <form.Field
                  name="releaseId"
                  children={(field) => (
                    <div className="grid gap-1.5">
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
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select release">
                            {field.state.value &&
                              (() => {
                                const selectedRelease = releasesData?.releases.find(
                                  (r) => r.id === field.state.value,
                                );
                                const displayData = selectedRelease || {
                                  date: itemData.releaseDate,
                                  type: itemData.releaseType,
                                  price: itemData.releasePrice,
                                  priceCurrency: itemData.releaseCurrency,
                                  barcode: itemData.releaseBarcode,
                                };

                                return (
                                  <div className="flex items-center gap-3 text-sm">
                                    <span className="font-medium">
                                      {formatDateOnlyForDisplay(displayData.date, dateFormat)}
                                    </span>
                                    {displayData.type && (
                                      <span className="text-muted-foreground">
                                        {displayData.type}
                                      </span>
                                    )}
                                    {displayData.price != null &&
                                      displayData.price > 0 &&
                                      displayData.priceCurrency?.trim() && (
                                        <span className="text-muted-foreground">
                                          {formatReleaseDate(
                                            displayData.price,
                                            displayData.priceCurrency,
                                            currency,
                                          )}
                                        </span>
                                      )}
                                  </div>
                                );
                              })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="min-w-(--anchor-width)">
                          {releasesLoading && (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                              <span className="ml-2 text-sm text-muted-foreground">
                                Loading releases...
                              </span>
                            </div>
                          )}
                          {releasesError && (
                            <div className="py-3 px-3 text-sm text-destructive">
                              {releasesError.message}
                            </div>
                          )}
                          {releasesData?.releases.map((release) => (
                            <SelectItem key={release.id} value={release.id} className="py-2.5">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {formatDateOnlyForDisplay(release.date, dateFormat)}
                                  </span>
                                  {release.type && (
                                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                      {release.type}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {release.price != null &&
                                    release.price > 0 &&
                                    release.priceCurrency?.trim() && (
                                      <span>
                                        {formatReleaseDate(
                                          release.price,
                                          release.priceCurrency,
                                          currency,
                                        )}
                                      </span>
                                    )}
                                  {release.barcode && <span>#{release.barcode}</span>}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                          {releasesData?.releases.length === 0 && !releasesLoading && (
                            <div className="py-4 px-3 text-sm text-muted-foreground text-center">
                              No releases found
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                />
              </FormSection>

              <FormSection title="Timeline">
                <div className="grid grid-cols-2 gap-3">
                  <form.Field
                    name="orderDate"
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Order Date</Label>
                        <DatePicker
                          id={field.name}
                          name={field.name}
                          value={field.state.value ?? null}
                          onBlur={field.handleBlur}
                          onChange={(value) => field.handleChange(value)}
                          placeholder="Select date"
                        />
                      </div>
                    )}
                  />

                  <form.Field
                    name="paymentDate"
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Payment Date</Label>
                        <DatePicker
                          id={field.name}
                          name={field.name}
                          value={field.state.value ?? null}
                          onBlur={field.handleBlur}
                          onChange={(value) => field.handleChange(value)}
                          placeholder="Select date"
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <form.Field
                    name="shippingDate"
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Shipping Date</Label>
                        <DatePicker
                          id={field.name}
                          name={field.name}
                          value={field.state.value ?? null}
                          onBlur={field.handleBlur}
                          onChange={(value) => field.handleChange(value)}
                          placeholder="Select date"
                        />
                      </div>
                    )}
                  />
                  <form.Field
                    name="collectionDate"
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Collection Date</Label>
                        <DatePicker
                          id={field.name}
                          name={field.name}
                          value={field.state.value ?? null}
                          onBlur={field.handleBlur}
                          onChange={(value) => field.handleChange(value)}
                          placeholder="Select date"
                        />
                      </div>
                    )}
                  />
                </div>

                <form.Field
                  name="shippingMethod"
                  validators={{
                    onChange: z.enum(SHIPPING_METHODS, "Shipping method is required"),
                  }}
                  children={(field) => (
                    <div className="grid gap-1.5">
                      <Label htmlFor={field.name}>Shipping Method</Label>
                      <Select
                        value={field.state.value ?? ""}
                        onValueChange={(value) =>
                          field.handleChange(value as typeof field.state.value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select shipping method" />
                        </SelectTrigger>
                        <SelectContent>
                          {SHIPPING_METHODS.map((method) => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!field.state.meta.isValid && (
                        <p role="alert" className="text-xs text-destructive">
                          {field.state.meta.errors.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                />
              </FormSection>

              <form.Field
                name="tags"
                children={(field) => (
                  <Field className="gap-1.5">
                    <FieldTitle>Tags</FieldTitle>
                    <FieldContent>
                      <div className="flex flex-wrap gap-2">
                        {field.state.value?.map((tag, tagIndex) => (
                          <Badge
                            key={tagIndex}
                            variant="outline"
                            className="flex items-center justify-between pr-0"
                          >
                            {tag}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const current = field.state.value || [];
                                field.handleChange(current.filter((_, idx) => idx !== tagIndex));
                              }}
                              className="hover:text-destructive hover:bg-transparent"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="tags-input"
                          type="text"
                          placeholder="Type a tag and press Enter"
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

              <FormSection title="Notes" defaultOpen={false}>
                <form.Field
                  name="notes"
                  children={(field) => (
                    <div className="grid gap-1.5">
                      <Textarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value ?? ""}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Add any notes..."
                        rows={3}
                      />
                    </div>
                  )}
                />
              </FormSection>
            </div>
          </Scroller>
          <SheetFooter className="flex flex-row w-full">
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <SheetClose>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex-1"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                </SheetClose>
              )}
            />
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="w-full flex-1"
                >
                  {isSubmitting ? (
                    <HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
                  ) : (
                    "Update"
                  )}
                </Button>
              )}
            />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
