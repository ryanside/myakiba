import { useForm } from "@tanstack/react-form";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { MaskInput } from "../ui/mask-input";
import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "../ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { DatePicker } from "../ui/date-picker";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "../ui/dialog";
import { X, ChevronDown, Loader2, ArrowLeft, Plus, Edit, Info } from "lucide-react";
import * as z from "zod";
import type { CascadeOptions } from "@/lib/orders/types";
import { useCascadeOptions } from "@/hooks/use-cascade-options";
import type { SyncFormOrder, SyncFormOrderItem, SyncOrder } from "@/lib/sync/types";
import { Textarea } from "../ui/textarea";
import { getCurrencyLocale, majorStringToMinorUnits } from "@myakiba/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { extractMfcItemId } from "@/lib/sync/utils";
import { SHIPPING_METHODS, ORDER_STATUSES, CONDITIONS } from "@myakiba/constants";

export default function SyncOrderForm({
  handleSyncOrderSubmit,
  currency,
}: {
  handleSyncOrderSubmit: (values: SyncOrder) => void;
  currency?: string;
}) {
  const navigate = useNavigate();
  const userCurrency = currency || "USD";
  const userLocale = getCurrencyLocale(userCurrency);

  const {
    cascadeOptions,
    cascadeOptionsList,
    cascadeDisplayText,
    handleSelectAll,
    handleSelectNone,
    handleCascadeOptionChange,
  } = useCascadeOptions();

  const orderForm = useForm({
    defaultValues: {
      status: "Ordered" as SyncFormOrder["status"],
      title: "New Order",
      shop: "",
      orderDate: "",
      releaseDate: "",
      paymentDate: "",
      shippingDate: "",
      collectionDate: "",
      shippingMethod: "n/a" as SyncFormOrder["shippingMethod"],
      shippingFee: "0.00",
      taxes: "0.00",
      duties: "0.00",
      tariffs: "0.00",
      miscFees: "0.00",
      notes: "",
      items: [
        {
          itemExternalId: "",
          price: "0.00",
          count: 1,
          status: "Ordered" as SyncFormOrderItem["status"],
          condition: "New",
          shippingMethod: "n/a" as SyncFormOrderItem["shippingMethod"],
          orderDate: "",
          paymentDate: "",
          shippingDate: "",
          collectionDate: "",
        },
      ] as SyncFormOrderItem[],
    },
    onSubmit: async ({ value }) => {
      const toMinorUnits = (amount: string): number => majorStringToMinorUnits(amount);
      const updatedItems = value.items.map((item) => {
        const updatedItem = { ...item };

        cascadeOptions.forEach((option: CascadeOptions[number]) => {
          if (option === "status" && value.status) {
            updatedItem.status = value.status as SyncFormOrderItem["status"];
          } else if (option === "orderDate" && value.orderDate) {
            updatedItem.orderDate = value.orderDate;
          } else if (option === "paymentDate" && value.paymentDate) {
            updatedItem.paymentDate = value.paymentDate;
          } else if (option === "shippingDate" && value.shippingDate) {
            updatedItem.shippingDate = value.shippingDate;
          } else if (option === "collectionDate" && value.collectionDate) {
            updatedItem.collectionDate = value.collectionDate;
          } else if (option === "shippingMethod" && value.shippingMethod) {
            updatedItem.shippingMethod =
              value.shippingMethod as SyncFormOrderItem["shippingMethod"];
          }
        });

        const extractedId = extractMfcItemId(updatedItem.itemExternalId);
        if (!extractedId) {
          throw new Error(`Invalid item ID: ${updatedItem.itemExternalId}`);
        }

        return {
          ...updatedItem,
          itemExternalId: parseInt(extractedId, 10),
          price: toMinorUnits(updatedItem.price),
          orderDate: updatedItem.orderDate || null,
          paymentDate: updatedItem.paymentDate || null,
          shippingDate: updatedItem.shippingDate || null,
          collectionDate: updatedItem.collectionDate || null,
        };
      });

      const updatedValue: SyncOrder = {
        ...value,
        orderDate: value.orderDate || null,
        releaseDate: value.releaseDate || null,
        paymentDate: value.paymentDate || null,
        shippingDate: value.shippingDate || null,
        collectionDate: value.collectionDate || null,
        shippingFee: toMinorUnits(value.shippingFee),
        taxes: toMinorUnits(value.taxes),
        duties: toMinorUnits(value.duties),
        tariffs: toMinorUnits(value.tariffs),
        miscFees: toMinorUnits(value.miscFees),
        items: updatedItems,
      };

      await handleSyncOrderSubmit(updatedValue);
      orderForm.reset();
    },
  });
  return (
    <div className="">
      <div className="p-4 pt-0 pl-0 w-full flex flex-row items-center justify-start gap-2">
        <Button
          variant="ghost"
          onClick={() => navigate({ to: "/sync" })}
          className="text-foreground"
          aria-label="Back to Sync Options"
          size="icon"
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-lg text-black dark:text-white">Add Order</h1>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void orderForm.handleSubmit();
        }}
        className="rounded-lg border p-4 space-y-4 w-full"
      >
        <div className="flex flex-row gap-2">
          <Label className="text-lg text-black dark:text-white">Order Details</Label>
          <orderForm.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                disabled={!canSubmit}
                variant="primary"
                className="ml-auto"
                size="md"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Order"}
              </Button>
            )}
          />
        </div>
        <div className="grid gap-2">
          <Label>Cascade Order Details to Items</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="max-w-66 truncate justify-between  hover:bg-background active:bg-background data-[state=open]:bg-background"
              >
                {cascadeDisplayText}
                <ChevronDown className="h-4 w-4 z-10" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
              <div className="flex gap-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={handleSelectAll}
                  type="button"
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={handleSelectNone}
                  type="button"
                >
                  Select None
                </Button>
              </div>
              <DropdownMenuSeparator />
              {cascadeOptionsList.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option}
                  onSelect={(e) => {
                    e.preventDefault();
                  }}
                  checked={cascadeOptions.includes(option as CascadeOptions[number])}
                  onCheckedChange={(checked) =>
                    handleCascadeOptionChange(option as CascadeOptions[number], checked)
                  }
                >
                  {option}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <orderForm.Field
            name="title"
            validators={{
              onChange: z.string().nonempty("Title is required"),
            }}
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Title</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  type="text"
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter order title"
                />
                {!field.state.meta.isValid && (
                  <em role="alert" className="text-red-500 text-xs">
                    {field.state.meta.errors[0]?.message}
                  </em>
                )}
              </div>
            )}
          />
          <orderForm.Field
            name="shop"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Shop</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? ""}
                  onBlur={field.handleBlur}
                  type="text"
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter shop name"
                />
              </div>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <orderForm.Field
            name="status"
            validators={{
              onChange: z.enum(ORDER_STATUSES, "Status is required"),
            }}
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Status</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as typeof field.state.value)}
                >
                  <SelectTrigger>
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
                {field.state.meta.errors && field.state.meta.errors.length > 0 ? (
                  <p className="text-sm text-red-500">{String(field.state.meta.errors[0])}</p>
                ) : null}
              </div>
            )}
          />
          <orderForm.Field
            name="shippingMethod"
            validators={{
              onChange: z.enum(SHIPPING_METHODS, "Shipping method is required"),
            }}
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Shipping Method</Label>
                <Select
                  value={field.state.value ?? ""}
                  onValueChange={(value) => field.handleChange(value as typeof field.state.value)}
                >
                  <SelectTrigger>
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
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <orderForm.Field
            name="orderDate"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Order Date</Label>
                <DatePicker
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? null}
                  onBlur={field.handleBlur}
                  onChange={(value) => field.handleChange(value ?? "")}
                  placeholder="Select order date"
                />
              </div>
            )}
          />
          <orderForm.Field
            name="paymentDate"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Payment Date</Label>
                <DatePicker
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? null}
                  onBlur={field.handleBlur}
                  onChange={(value) => field.handleChange(value ?? "")}
                  placeholder="Select payment date"
                />
              </div>
            )}
          />
          <orderForm.Field
            name="shippingDate"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Shipping Date</Label>
                <DatePicker
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? null}
                  onBlur={field.handleBlur}
                  onChange={(value) => field.handleChange(value ?? "")}
                  placeholder="Select shipping date"
                />
              </div>
            )}
          />
          <orderForm.Field
            name="collectionDate"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Collection Date</Label>
                <DatePicker
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? null}
                  onBlur={field.handleBlur}
                  onChange={(value) => field.handleChange(value ?? "")}
                  placeholder="Select collection date"
                />
              </div>
            )}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <orderForm.Field
            name="shippingFee"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Shipping Fee</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={userCurrency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />
          <orderForm.Field
            name="taxes"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Taxes</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={userCurrency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />
          <orderForm.Field
            name="duties"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Duties</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={userCurrency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />
          <orderForm.Field
            name="tariffs"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Tariffs</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={userCurrency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />
          <orderForm.Field
            name="miscFees"
            children={(field) => (
              <div className="grid gap-2">
                <Label htmlFor={field.name}>Miscellaneous Fees</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={userCurrency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />
        </div>
        <orderForm.Field
          name="notes"
          children={(field) => (
            <div className="grid gap-2">
              <Label htmlFor={field.name}>Notes</Label>
              <Textarea
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                maxLength={1000}
                onChange={(e) => field.handleChange(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Enter additional notes..."
              />
            </div>
          )}
        />
        <Separator />
        <orderForm.Field
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
          {(field) => {
            return (
              <div className="flex flex-col gap-4">
                <div className="flex flex-row gap-3 items-center">
                  <Label className="text-lg text-black dark:text-white">Order Items</Label>
                  <Badge size="sm">
                    {field.state.value.length} {field.state.value.length === 1 ? "item" : "items"}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4" />
                    </TooltipTrigger>
                    <TooltipContent className="max-h-40">
                      <p>
                        Once you set the order and/or item(s) status to "Owned", the item(s) will
                        get added to your collection.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {field.state.value.map((_, i) => {
                  return (
                    <orderForm.Field
                      key={i}
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
                      {(subField) => {
                        return (
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
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" type="button">
                                    <Edit />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>Edit Order Item </DialogTitle>
                                    <DialogDescription>
                                      MFC Item: {subField.state.value || "Not set"}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <orderForm.Field
                                        name={`items[${i}].price`}
                                        validators={{
                                          onChange: z.string().nonempty("Price is required"),
                                        }}
                                        children={(priceField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`price-${i}`}>Price</Label>
                                            <MaskInput
                                              id={`price-${i}`}
                                              name={priceField.name}
                                              mask="currency"
                                              currency={userCurrency}
                                              locale={userLocale}
                                              value={priceField.state.value}
                                              onBlur={priceField.handleBlur}
                                              onValueChange={(maskedValue, unmaskedValue) =>
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
                                      />
                                      <orderForm.Field
                                        name={`items[${i}].count`}
                                        validators={{
                                          onChange: z.number().min(1, "Count must be at least 1"),
                                        }}
                                        children={(countField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`count-${i}`}>Count</Label>
                                            <Input
                                              id={`count-${i}`}
                                              name={countField.name}
                                              value={countField.state.value}
                                              onBlur={countField.handleBlur}
                                              type="number"
                                              min="1"
                                              onChange={(e) =>
                                                countField.handleChange(
                                                  parseInt(e.target.value) || 1,
                                                )
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
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      <orderForm.Field
                                        name={`items[${i}].condition`}
                                        children={(conditionField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`condition-${i}`}>Condition</Label>
                                            <Select
                                              value={conditionField.state.value ?? ""}
                                              onValueChange={(value) =>
                                                conditionField.handleChange(
                                                  value as typeof conditionField.state.value,
                                                )
                                              }
                                            >
                                              <SelectTrigger>
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
                                      <orderForm.Field
                                        name={`items[${i}].status`}
                                        validators={{
                                          onChange: z.enum(ORDER_STATUSES, "Status is required"),
                                        }}
                                        children={(statusField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`status-${i}`}>Status</Label>
                                            <Select
                                              value={statusField.state.value ?? ""}
                                              onValueChange={(value) =>
                                                statusField.handleChange(
                                                  value as typeof statusField.state.value,
                                                )
                                              }
                                            >
                                              <SelectTrigger>
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
                                      />
                                    </div>

                                    <orderForm.Field
                                      name={`items[${i}].shippingMethod`}
                                      validators={{
                                        onChange: z.enum(
                                          SHIPPING_METHODS,
                                          "Shipping method is required",
                                        ),
                                      }}
                                      children={(shippingField) => (
                                        <div className="grid gap-2">
                                          <Label htmlFor={`shipping-${i}`}>Shipping Method</Label>
                                          <Select
                                            value={shippingField.state.value ?? ""}
                                            onValueChange={(value) =>
                                              shippingField.handleChange(
                                                value as typeof shippingField.state.value,
                                              )
                                            }
                                          >
                                            <SelectTrigger>
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
                                    />

                                    <div className="grid grid-cols-2 gap-4">
                                      <orderForm.Field
                                        name={`items[${i}].orderDate`}
                                        children={(orderDateField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`orderDate-${i}`}>Order Date</Label>
                                            <DatePicker
                                              id={`orderDate-${i}`}
                                              name={orderDateField.name}
                                              value={orderDateField.state.value ?? null}
                                              onBlur={orderDateField.handleBlur}
                                              onChange={(value) =>
                                                orderDateField.handleChange(value ?? "")
                                              }
                                              placeholder="Select order date"
                                            />
                                          </div>
                                        )}
                                      />
                                      <orderForm.Field
                                        name={`items[${i}].paymentDate`}
                                        children={(paymentDateField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`paymentDate-${i}`}>Payment Date</Label>
                                            <DatePicker
                                              id={`paymentDate-${i}`}
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
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      <orderForm.Field
                                        name={`items[${i}].shippingDate`}
                                        children={(shippingDateField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`shippingDate-${i}`}>
                                              Shipping Date
                                            </Label>
                                            <DatePicker
                                              id={`shippingDate-${i}`}
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
                                      />
                                      <orderForm.Field
                                        name={`items[${i}].collectionDate`}
                                        children={(collectionDateField) => (
                                          <div className="grid gap-2">
                                            <Label htmlFor={`collectionDate-${i}`}>
                                              Collection Date
                                            </Label>
                                            <DatePicker
                                              id={`collectionDate-${i}`}
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
                                      />
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <DialogClose asChild>
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
                                onClick={() => field.removeValue(i)}
                                disabled={field.state.value.length === 1}
                              >
                                <X className="text-red-500" />
                              </Button>
                            </div>
                            {!subField.state.meta.isValid && (
                              <em role="alert" className="text-red-500 text-xs">
                                {subField.state.meta.errors[0]}
                              </em>
                            )}
                          </div>
                        );
                      }}
                    </orderForm.Field>
                  );
                })}
                <Button
                  variant="outline"
                  className="max-w-md"
                  disabled={field.state.value.length === 30}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    field.pushValue({
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
                    });
                  }}
                >
                  <Plus /> Add Item
                </Button>
              </div>
            );
          }}
        </orderForm.Field>
      </form>
    </div>
  );
}
