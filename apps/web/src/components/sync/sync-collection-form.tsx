import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, Edit03Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { useForm } from "@tanstack/react-form";
import { Button } from "../ui/button";
import type { SyncCollectionItem } from "@myakiba/contracts/sync/types";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { MaskInput } from "../ui/mask-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { DialogFooter, DialogClose } from "../ui/dialog";
import { Badge } from "@/components/reui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { DatePicker } from "../ui/date-picker";
import * as z from "zod";
import { Rating } from "../ui/rating";
import { Textarea } from "../ui/textarea";
import { FormSection } from "@/components/ui/form-section";
import { majorStringToMinorUnits } from "@myakiba/utils/currency";
import { createDefaultSyncFormCollectionItem, extractMfcItemId } from "@/lib/sync";
import { CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { Currency } from "@myakiba/contracts/shared/types";
import { getCurrencyLocale } from "@/lib/locale";

export default function SyncCollectionForm({
  handleSyncCollectionSubmit,
  currency,
}: {
  handleSyncCollectionSubmit: (values: SyncCollectionItem[]) => void;
  currency: Currency;
}) {
  const userLocale = getCurrencyLocale(currency);

  const collectionForm = useForm({
    defaultValues: {
      items: [createDefaultSyncFormCollectionItem()],
    },
    onSubmit: async ({ value }) => {
      const toMinorUnits = (amount: string): number => majorStringToMinorUnits(amount);
      const payload = value.items.map((item) => {
        const extractedId = extractMfcItemId(item.itemExternalId);
        if (!extractedId) {
          throw new Error(`Invalid item ID: ${item.itemExternalId}`);
        }
        const { formRowId, ...rest } = item;
        void formRowId;
        return {
          ...rest,
          itemExternalId: parseInt(extractedId, 10),
          price: toMinorUnits(item.price),
          orderDate: item.orderDate || null,
          paymentDate: item.paymentDate || null,
          shippingDate: item.shippingDate || null,
          collectionDate: item.collectionDate || null,
          score: item.score.toString(),
        };
      });
      await handleSyncCollectionSubmit(payload);
      collectionForm.reset();
    },
  });

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void collectionForm.handleSubmit();
        }}
        className="space-y-3 w-full"
      >
        <collectionForm.Field
          name="items"
          mode="array"
          validators={{
            onSubmit: ({ value }) => {
              if (value.length === 0) {
                return "At least one item is required";
              }
            },
          }}
        >
          {(field) => (
            <div className="flex flex-col gap-4">
              <div className="flex flex-row gap-3 items-center">
                <Label className="text-lg text-foreground">Collection Items</Label>
                <Badge size="sm" variant="secondary">
                  {field.state.value.length} {field.state.value.length === 1 ? "item" : "items"}
                </Badge>
                <collectionForm.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting]}
                  children={([canSubmit, isSubmitting]) => (
                    <Button
                      type="submit"
                      disabled={!canSubmit}
                      variant="default"
                      className="ml-auto"
                    >
                      {isSubmitting ? (
                        <HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
                      ) : (
                        "Submit Items"
                      )}
                    </Button>
                  )}
                />
              </div>

              {field.state.value.map((item, i) => (
                <collectionForm.Field
                  key={item.formRowId}
                  name={`items[${i}].itemExternalId`}
                  validators={{
                    onChange: ({ value }: { value: string }) => {
                      if (!value || typeof value !== "string" || value.trim() === "") {
                        return "MyFigureCollection Item URL or ID is required";
                      }
                      const extractedId = extractMfcItemId(value);
                      if (!extractedId) {
                        return "Please enter a valid MyFigureCollection Item ID or URL";
                      }
                    },
                  }}
                >
                  {(subField) => (
                    <div className="max-w-md">
                      <div className="flex flex-row gap-2">
                        <Input
                          value={subField.state.value}
                          onChange={(e) => subField.handleChange(e.target.value)}
                          onPaste={(e) => {
                            const text = e.clipboardData.getData("text/plain");
                            const lines = text
                              .split(/\r?\n/)
                              .map((l) => l.trim())
                              .filter(Boolean);
                            if (lines.length > 1) {
                              e.preventDefault();
                              subField.handleChange(lines[0] ?? "");
                              const currentLength = field.state.value.length;
                              const remainingSlots = 10 - currentLength;
                              const toAdd = Math.min(lines.length - 1, remainingSlots);
                              for (let j = 1; j <= toAdd; j++) {
                                field.pushValue({
                                  ...createDefaultSyncFormCollectionItem(),
                                  itemExternalId: lines[j] ?? "",
                                });
                              }
                            }
                          }}
                          type="text"
                          placeholder="MyFigureCollection Item URL or ID"
                          className="max-w-sm"
                        />

                        <Dialog>
                          <DialogTrigger
                            render={
                              <Button variant="ghost" size="icon" type="button">
                                <HugeiconsIcon icon={Edit03Icon} />
                              </Button>
                            }
                          />
                          <DialogContent
                            className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto px-0"
                            forceRenderBackdrop
                          >
                            <DialogHeader className="px-4">
                              <DialogTitle>Edit Collection Item</DialogTitle>
                              <DialogDescription>
                                MFC Item: {subField.state.value || "Not set"}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-3 py-4 px-4">
                              <FormSection title="Basics">
                                <div className="grid grid-cols-2 gap-3">
                                  <collectionForm.Field
                                    name={`items[${i}].price`}
                                    validators={{
                                      onChange: z.string().nonempty("Price is required"),
                                    }}
                                    children={(priceField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`price-${item.formRowId}`}>Price</Label>
                                        <MaskInput
                                          id={`price-${item.formRowId}`}
                                          name={priceField.name}
                                          mask="currency"
                                          currency={currency}
                                          locale={userLocale}
                                          value={priceField.state.value}
                                          onBlur={priceField.handleBlur}
                                          onValueChange={(_maskedValue, unmaskedValue) =>
                                            priceField.handleChange(unmaskedValue)
                                          }
                                          placeholder="0.00"
                                        />
                                        {!priceField.state.meta.isValid && (
                                          <p role="alert" className="text-xs text-destructive">
                                            {priceField.state.meta.errors.join(", ")}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  />
                                  <collectionForm.Field
                                    name={`items[${i}].count`}
                                    validators={{
                                      onChange: z.number().min(1, "Count must be at least 1"),
                                    }}
                                    children={(countField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`count-${item.formRowId}`}>Count</Label>
                                        <Input
                                          id={`count-${item.formRowId}`}
                                          name={countField.name}
                                          value={countField.state.value}
                                          onBlur={countField.handleBlur}
                                          type="number"
                                          min="1"
                                          onChange={(e) =>
                                            countField.handleChange(parseInt(e.target.value) || 1)
                                          }
                                          placeholder="1"
                                        />
                                        {!countField.state.meta.isValid && (
                                          <p role="alert" className="text-xs text-destructive">
                                            {countField.state.meta.errors.join(", ")}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <collectionForm.Field
                                    name={`items[${i}].condition`}
                                    children={(conditionField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`condition-${item.formRowId}`}>
                                          Condition
                                        </Label>
                                        <Select
                                          value={conditionField.state.value ?? ""}
                                          onValueChange={(value) =>
                                            conditionField.handleChange(
                                              value as typeof conditionField.state.value,
                                            )
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
                                      </div>
                                    )}
                                  />
                                  <collectionForm.Field
                                    name={`items[${i}].score`}
                                    children={(scoreField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`score-${item.formRowId}`}>Score</Label>
                                        <div className="my-auto">
                                          <Rating
                                            rating={scoreField.state.value ?? 0}
                                            editable={true}
                                            onRatingChange={scoreField.handleChange}
                                            showValue={true}
                                            maxRating={10}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  />
                                </div>
                              </FormSection>

                              <FormSection title="Details">
                                <collectionForm.Field
                                  name={`items[${i}].shop`}
                                  children={(shopField) => (
                                    <div className="grid gap-1.5">
                                      <Label htmlFor={`shop-${item.formRowId}`}>Shop</Label>
                                      <Input
                                        id={`shop-${item.formRowId}`}
                                        name={shopField.name}
                                        value={shopField.state.value ?? ""}
                                        onBlur={shopField.handleBlur}
                                        type="text"
                                        onChange={(e) => shopField.handleChange(e.target.value)}
                                        placeholder="e.g., AmiAmi"
                                      />
                                    </div>
                                  )}
                                />

                                <collectionForm.Field
                                  name={`items[${i}].shippingMethod`}
                                  validators={{
                                    onChange: z.enum(
                                      SHIPPING_METHODS,
                                      "Shipping method is required",
                                    ),
                                  }}
                                  children={(shippingField) => (
                                    <div className="grid gap-1.5">
                                      <Label htmlFor={`shipping-${item.formRowId}`}>
                                        Shipping Method
                                      </Label>
                                      <Select
                                        value={shippingField.state.value ?? ""}
                                        onValueChange={(value) =>
                                          shippingField.handleChange(
                                            value as typeof shippingField.state.value,
                                          )
                                        }
                                      >
                                        <SelectTrigger className="w-full">
                                          <SelectValue placeholder="Select method" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {SHIPPING_METHODS.map((method) => (
                                            <SelectItem key={method} value={method}>
                                              {method}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                />
                              </FormSection>

                              <FormSection title="Timeline">
                                <div className="grid grid-cols-2 gap-3">
                                  <collectionForm.Field
                                    name={`items[${i}].orderDate`}
                                    children={(orderDateField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`orderDate-${item.formRowId}`}>
                                          Order Date
                                        </Label>
                                        <DatePicker
                                          id={`orderDate-${item.formRowId}`}
                                          name={orderDateField.name}
                                          value={orderDateField.state.value ?? null}
                                          onBlur={orderDateField.handleBlur}
                                          onChange={(value) =>
                                            orderDateField.handleChange(value ?? "")
                                          }
                                          placeholder="Select date"
                                        />
                                      </div>
                                    )}
                                  />
                                  <collectionForm.Field
                                    name={`items[${i}].paymentDate`}
                                    children={(paymentDateField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`paymentDate-${item.formRowId}`}>
                                          Payment Date
                                        </Label>
                                        <DatePicker
                                          id={`paymentDate-${item.formRowId}`}
                                          name={paymentDateField.name}
                                          value={paymentDateField.state.value ?? null}
                                          onBlur={paymentDateField.handleBlur}
                                          onChange={(value) =>
                                            paymentDateField.handleChange(value ?? "")
                                          }
                                          placeholder="Select date"
                                        />
                                      </div>
                                    )}
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <collectionForm.Field
                                    name={`items[${i}].shippingDate`}
                                    children={(shippingDateField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`shippingDate-${item.formRowId}`}>
                                          Shipping Date
                                        </Label>
                                        <DatePicker
                                          id={`shippingDate-${item.formRowId}`}
                                          name={shippingDateField.name}
                                          value={shippingDateField.state.value ?? null}
                                          onBlur={shippingDateField.handleBlur}
                                          onChange={(value) =>
                                            shippingDateField.handleChange(value ?? "")
                                          }
                                          placeholder="Select date"
                                        />
                                      </div>
                                    )}
                                  />
                                  <collectionForm.Field
                                    name={`items[${i}].collectionDate`}
                                    children={(collectionDateField) => (
                                      <div className="grid gap-1.5">
                                        <Label htmlFor={`collectionDate-${item.formRowId}`}>
                                          Collection Date
                                        </Label>
                                        <DatePicker
                                          id={`collectionDate-${item.formRowId}`}
                                          name={collectionDateField.name}
                                          value={collectionDateField.state.value ?? null}
                                          onBlur={collectionDateField.handleBlur}
                                          onChange={(value) =>
                                            collectionDateField.handleChange(value ?? "")
                                          }
                                          placeholder="Select date"
                                        />
                                      </div>
                                    )}
                                  />
                                </div>
                              </FormSection>

                              <FormSection title="Extras" defaultOpen={false}>
                                <collectionForm.Field
                                  name={`items[${i}].tags`}
                                  mode="array"
                                  children={(tagsField) => (
                                    <div className="grid gap-1.5">
                                      <Label htmlFor={`tags-input-${item.formRowId}`}>Tags</Label>
                                      <div className="flex flex-wrap gap-2">
                                        {tagsField.state.value.map((tag, tagIndex) => (
                                          <Badge
                                            key={tagIndex}
                                            variant="outline"
                                            className="flex items-center gap-1 text-foreground"
                                          >
                                            {tag}
                                            <button
                                              type="button"
                                              onClick={() => tagsField.removeValue(tagIndex)}
                                              className="ml-1 hover:text-destructive"
                                            >
                                              <HugeiconsIcon
                                                icon={Cancel01Icon}
                                                className="w-3 h-3"
                                              />
                                            </button>
                                          </Badge>
                                        ))}
                                      </div>
                                      <Input
                                        id={`tags-input-${item.formRowId}`}
                                        type="text"
                                        placeholder="Type a tag and press Enter"
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            const input = e.currentTarget;
                                            const value = input.value.trim();
                                            if (value) {
                                              tagsField.pushValue(value);
                                              input.value = "";
                                            }
                                          }
                                        }}
                                      />
                                    </div>
                                  )}
                                />

                                <collectionForm.Field
                                  name={`items[${i}].notes`}
                                  children={(notesField) => (
                                    <div className="grid gap-1.5">
                                      <Label htmlFor={`notes-${item.formRowId}`}>Notes</Label>
                                      <Textarea
                                        id={`notes-${item.formRowId}`}
                                        name={notesField.name}
                                        value={notesField.state.value ?? ""}
                                        onBlur={notesField.handleBlur}
                                        onChange={(e) => notesField.handleChange(e.target.value)}
                                        placeholder="Add any notes..."
                                        rows={3}
                                      />
                                    </div>
                                  )}
                                />
                              </FormSection>
                            </div>
                            <DialogFooter className="px-4! mx-0">
                              <DialogClose>
                                <Button variant="outline" type="button">
                                  Done
                                </Button>
                              </DialogClose>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            field.removeValue(i);
                          }}
                          disabled={field.state.value.length === 1}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} className="text-destructive" />
                        </Button>
                      </div>
                      {!subField.state.meta.isValid && (
                        <p role="alert" className="text-xs text-destructive mt-1">
                          {subField.state.meta.errors[0]}
                        </p>
                      )}
                    </div>
                  )}
                </collectionForm.Field>
              ))}
              <Button
                variant="outline"
                className="max-w-md"
                disabled={field.state.value.length === 10}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  field.pushValue(createDefaultSyncFormCollectionItem());
                }}
              >
                <HugeiconsIcon icon={Add01Icon} /> Add More Items
              </Button>
            </div>
          )}
        </collectionForm.Field>
      </form>
    </div>
  );
}
