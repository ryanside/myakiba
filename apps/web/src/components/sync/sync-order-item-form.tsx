import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Edit01Icon,
  InformationCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { Badge } from "@/components/reui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaskInput } from "@/components/ui/mask-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SyncFormOrderItem, SyncOrderItems } from "@myakiba/types";
import { CONDITIONS, ORDER_STATUSES, SHIPPING_METHODS } from "@myakiba/constants";
import { getCurrencyLocale, majorStringToMinorUnits } from "@myakiba/utils";
import { extractMfcItemId } from "@/lib/sync";

type SyncOrderItemFormProps = {
  readonly orderId: string;
  readonly handleSyncOrderItemSubmit: (values: SyncOrderItems) => Promise<void>;
  readonly currency?: string;
};

function createDefaultSyncFormOrderItem(): SyncFormOrderItem {
  return {
    itemExternalId: "",
    price: "0.00",
    count: 1,
    status: "Ordered",
    condition: "New",
    shippingMethod: "n/a",
    orderDate: "",
    paymentDate: "",
    shippingDate: "",
    collectionDate: "",
  };
}

export default function SyncOrderItemForm({
  orderId,
  handleSyncOrderItemSubmit,
  currency,
}: SyncOrderItemFormProps) {
  const userCurrency = currency || "USD";
  const userLocale = getCurrencyLocale(userCurrency);

  const orderItemForm = useForm({
    defaultValues: {
      items: [createDefaultSyncFormOrderItem()] as SyncFormOrderItem[],
    },
    onSubmit: async ({ value }) => {
      const updatedItems = value.items.map((item) => {
        const extractedId = extractMfcItemId(item.itemExternalId);
        if (!extractedId) {
          throw new Error(`Invalid item ID: ${item.itemExternalId}`);
        }

        return {
          ...item,
          itemExternalId: parseInt(extractedId, 10),
          price: majorStringToMinorUnits(item.price),
          orderDate: item.orderDate || null,
          paymentDate: item.paymentDate || null,
          shippingDate: item.shippingDate || null,
          collectionDate: item.collectionDate || null,
        };
      });

      await handleSyncOrderItemSubmit({
        orderId,
        items: updatedItems,
      });
      orderItemForm.reset();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void orderItemForm.handleSubmit();
      }}
      className="space-y-4 rounded-lg w-full"
    >
      <div className="flex flex-row gap-2">
        <Label className="text-lg text-black dark:text-white">Order Items</Label>
        <orderItemForm.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <Button type="submit" disabled={!canSubmit} variant="default" className="ml-auto">
              {isSubmitting ? (
                <HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
              ) : (
                "Add to Order"
              )}
            </Button>
          )}
        />
      </div>

      <orderItemForm.Field
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
              <Label className="text-lg text-black dark:text-white">New Items</Label>
              <Badge>
                {field.state.value.length} {field.state.value.length === 1 ? "item" : "items"}
              </Badge>
              <Tooltip>
                <TooltipTrigger>
                  <HugeiconsIcon icon={InformationCircleIcon} className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent className="max-h-40">
                  <p>
                    When an item status is set to "Owned", it will be added to your collection on
                    the linked order.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            {field.state.value.map((_, index) => (
              <orderItemForm.Field
                key={index}
                name={`items[${index}].itemExternalId`}
                validators={{
                  onChange: ({ value }: { value: string }) => {
                    if (!value || value.trim() === "") {
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
                  <div className="max-w-md rounded-lg">
                    <div className="flex flex-row gap-2">
                      <Input
                        value={subField.state.value}
                        onChange={(e) => subField.handleChange(e.target.value)}
                        type="text"
                        placeholder="MyFigureCollection Item URL or ID"
                        className="max-w-sm"
                      />
                      <Dialog>
                        <DialogTrigger
                          render={
                            <Button variant="ghost" size="icon" type="button">
                              <HugeiconsIcon icon={Edit01Icon} />
                            </Button>
                          }
                        />
                        <DialogContent
                          className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto"
                          forceRenderBackdrop
                        >
                          <DialogHeader>
                            <DialogTitle>Edit Order Item</DialogTitle>
                            <DialogDescription>
                              MFC Item: {subField.state.value || "Not set"}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <orderItemForm.Field
                                name={`items[${index}].price`}
                                validators={{
                                  onChange: z.string().nonempty("Price is required"),
                                }}
                              >
                                {(priceField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`price-${index}`}>Price</Label>
                                    <MaskInput
                                      id={`price-${index}`}
                                      name={priceField.name}
                                      mask="currency"
                                      currency={userCurrency}
                                      locale={userLocale}
                                      value={priceField.state.value}
                                      onBlur={priceField.handleBlur}
                                      onValueChange={(_maskedValue, unmaskedValue) =>
                                        priceField.handleChange(unmaskedValue)
                                      }
                                      placeholder="0.00"
                                    />
                                    {!priceField.state.meta.isValid && (
                                      <em role="alert" className="text-red-500 text-xs">
                                        {priceField.state.meta.errors.join(", ")}
                                      </em>
                                    )}
                                  </div>
                                )}
                              </orderItemForm.Field>
                              <orderItemForm.Field
                                name={`items[${index}].count`}
                                validators={{
                                  onChange: z.number().min(1, "Count must be at least 1"),
                                }}
                              >
                                {(countField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`count-${index}`}>Count</Label>
                                    <Input
                                      id={`count-${index}`}
                                      name={countField.name}
                                      value={countField.state.value}
                                      onBlur={countField.handleBlur}
                                      type="number"
                                      min="1"
                                      onChange={(e) =>
                                        countField.handleChange(parseInt(e.target.value, 10) || 1)
                                      }
                                      placeholder="1"
                                    />
                                    {!countField.state.meta.isValid && (
                                      <em role="alert" className="text-red-500 text-xs">
                                        {countField.state.meta.errors.join(", ")}
                                      </em>
                                    )}
                                  </div>
                                )}
                              </orderItemForm.Field>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <orderItemForm.Field name={`items[${index}].condition`}>
                                {(conditionField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`condition-${index}`}>Condition</Label>
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
                              </orderItemForm.Field>
                              <orderItemForm.Field
                                name={`items[${index}].status`}
                                validators={{
                                  onChange: z.enum(ORDER_STATUSES, "Status is required"),
                                }}
                              >
                                {(statusField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`status-${index}`}>Status</Label>
                                    <Select
                                      value={statusField.state.value ?? ""}
                                      onValueChange={(value) =>
                                        statusField.handleChange(
                                          value as typeof statusField.state.value,
                                        )
                                      }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ORDER_STATUSES.map((status) => (
                                          <SelectItem key={status} value={status}>
                                            {status}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {!statusField.state.meta.isValid && (
                                      <em role="alert" className="text-red-500 text-xs">
                                        {statusField.state.meta.errors.join(", ")}
                                      </em>
                                    )}
                                  </div>
                                )}
                              </orderItemForm.Field>
                            </div>

                            <orderItemForm.Field
                              name={`items[${index}].shippingMethod`}
                              validators={{
                                onChange: z.enum(SHIPPING_METHODS, "Shipping method is required"),
                              }}
                            >
                              {(shippingField) => (
                                <div className="grid gap-2">
                                  <Label htmlFor={`shipping-${index}`}>Shipping Method</Label>
                                  <Select
                                    value={shippingField.state.value ?? ""}
                                    onValueChange={(value) =>
                                      shippingField.handleChange(
                                        value as typeof shippingField.state.value,
                                      )
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
                                </div>
                              )}
                            </orderItemForm.Field>

                            <div className="grid grid-cols-2 gap-4">
                              <orderItemForm.Field name={`items[${index}].orderDate`}>
                                {(orderDateField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`orderDate-${index}`}>Order Date</Label>
                                    <DatePicker
                                      id={`orderDate-${index}`}
                                      name={orderDateField.name}
                                      value={orderDateField.state.value ?? null}
                                      onBlur={orderDateField.handleBlur}
                                      onChange={(value) => orderDateField.handleChange(value ?? "")}
                                      placeholder="Select order date"
                                    />
                                  </div>
                                )}
                              </orderItemForm.Field>
                              <orderItemForm.Field name={`items[${index}].paymentDate`}>
                                {(paymentDateField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`paymentDate-${index}`}>Payment Date</Label>
                                    <DatePicker
                                      id={`paymentDate-${index}`}
                                      name={paymentDateField.name}
                                      value={paymentDateField.state.value ?? null}
                                      onBlur={paymentDateField.handleBlur}
                                      onChange={(value) =>
                                        paymentDateField.handleChange(value ?? "")
                                      }
                                      placeholder="Select payment date"
                                    />
                                  </div>
                                )}
                              </orderItemForm.Field>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <orderItemForm.Field name={`items[${index}].shippingDate`}>
                                {(shippingDateField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`shippingDate-${index}`}>Shipping Date</Label>
                                    <DatePicker
                                      id={`shippingDate-${index}`}
                                      name={shippingDateField.name}
                                      value={shippingDateField.state.value ?? null}
                                      onBlur={shippingDateField.handleBlur}
                                      onChange={(value) =>
                                        shippingDateField.handleChange(value ?? "")
                                      }
                                      placeholder="Select shipping date"
                                    />
                                  </div>
                                )}
                              </orderItemForm.Field>
                              <orderItemForm.Field name={`items[${index}].collectionDate`}>
                                {(collectionDateField) => (
                                  <div className="grid gap-2">
                                    <Label htmlFor={`collectionDate-${index}`}>
                                      Collection Date
                                    </Label>
                                    <DatePicker
                                      id={`collectionDate-${index}`}
                                      name={collectionDateField.name}
                                      value={collectionDateField.state.value ?? null}
                                      onBlur={collectionDateField.handleBlur}
                                      onChange={(value) =>
                                        collectionDateField.handleChange(value ?? "")
                                      }
                                      placeholder="Select collection date"
                                    />
                                  </div>
                                )}
                              </orderItemForm.Field>
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose>
                              <Button variant="outline" type="button">
                                Close
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
                          field.removeValue(index);
                        }}
                        disabled={field.state.value.length === 1}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="text-red-500" />
                      </Button>
                    </div>
                    {!subField.state.meta.isValid && (
                      <em role="alert" className="text-red-500 text-xs">
                        {subField.state.meta.errors[0]}
                      </em>
                    )}
                  </div>
                )}
              </orderItemForm.Field>
            ))}

            <Button
              variant="outline"
              className="max-w-md"
              disabled={field.state.value.length === 30}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                field.pushValue(createDefaultSyncFormOrderItem());
              }}
            >
              <HugeiconsIcon icon={Add01Icon} /> Add Item
            </Button>
          </div>
        )}
      </orderItemForm.Field>
    </form>
  );
}
