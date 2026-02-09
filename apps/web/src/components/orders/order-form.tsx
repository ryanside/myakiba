import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { MaskInput } from "@/components/ui/mask-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import * as z from "zod";
import type { EditedOrder, NewOrder, Order } from "@myakiba/types";
import { Loader2 } from "lucide-react";
import type { CascadeOptions } from "@myakiba/types";
import { useCascadeOptions } from "@/hooks/use-cascade-options";
import { CascadeOptionsDropdown } from "@/components/cascade-options-dropdown";
import { Textarea } from "../ui/textarea";
import {
  getCurrencyLocale,
  majorStringToMinorUnits,
  minorUnitsToMajorString,
} from "@myakiba/utils";
import { Scroller } from "../ui/scroller";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/constants";

type MergeOrderFormProps = {
  renderTrigger: React.ReactNode;
  orderIds: Set<string>;
  collectionIds?: Set<string>;
  type: "merge";
  callbackFn: (
    value: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: Set<string>,
  ) => Promise<void>;
  clearSelections: () => void;
  currency?: string;
};

type SplitOrderFormProps = {
  renderTrigger: React.ReactNode;
  orderIds: Set<string>;
  collectionIds: Set<string>;
  type: "split";
  callbackFn: (
    value: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: Set<string>,
    orderIds: Set<string>,
  ) => Promise<void>;
  clearSelections: () => void;
  currency?: string;
};

type EditOrderFormProps = {
  renderTrigger: React.ReactNode;
  orderIds?: Set<string>;
  collectionIds?: Set<string>;
  type: "edit-order";
  callbackFn: (value: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  orderData: Order;
  clearSelections?: () => void;
  currency?: string;
};

type OrderFormProps = MergeOrderFormProps | SplitOrderFormProps | EditOrderFormProps;

export function OrderForm(props: OrderFormProps) {
  const { callbackFn, type, orderIds, collectionIds, clearSelections, currency, renderTrigger } =
    props;

  const userCurrency = currency || "USD";
  const userLocale = getCurrencyLocale(userCurrency);

  const {
    cascadeOptions,
    handleSelectAll,
    handleSelectNone,
    handleCascadeOptionChange,
    cascadeDisplayText,
    cascadeOptionsList,
  } = useCascadeOptions();

  const selectedCount =
    type === "merge"
      ? props.orderIds.size
      : type === "split"
        ? props.collectionIds.size
        : undefined;
  const orderData = type === "edit-order" ? props.orderData : undefined;

  const formatMoneyForInput = (value: number | null | undefined): string =>
    minorUnitsToMajorString(value ?? 0);
  const toMinorUnits = (value: string): number => majorStringToMinorUnits(value);

  const form = useForm({
    defaultValues: orderData
      ? {
          ...orderData,
          shippingFee: formatMoneyForInput(orderData.shippingFee),
          taxes: formatMoneyForInput(orderData.taxes),
          duties: formatMoneyForInput(orderData.duties),
          tariffs: formatMoneyForInput(orderData.tariffs),
          miscFees: formatMoneyForInput(orderData.miscFees),
        }
      : {
          status: "Ordered" as const,
          title:
            type === "merge"
              ? "New Merged Order"
              : type === "split"
                ? "New Split Order"
                : "Edit Order",
          shop: "",
          orderDate: "",
          releaseDate: "",
          paymentDate: "",
          shippingDate: "",
          collectionDate: "",
          shippingMethod: "n/a" as const,
          shippingFee: "0.00",
          taxes: "0.00",
          duties: "0.00",
          tariffs: "0.00",
          miscFees: "0.00",
          notes: "",
        },
    onSubmit: async ({ value }) => {
      if (type === "edit-order") {
        const transformedValue: EditedOrder = {
          orderId: orderData!.orderId,
          title: value.title,
          shop: value.shop,
          orderDate: value.orderDate || null,
          releaseDate: value.releaseDate || null,
          paymentDate: value.paymentDate || null,
          shippingDate: value.shippingDate || null,
          collectionDate: value.collectionDate || null,
          status: value.status,
          shippingMethod: value.shippingMethod || "n/a",
          shippingFee: toMinorUnits(value.shippingFee),
          taxes: toMinorUnits(value.taxes),
          duties: toMinorUnits(value.duties),
          tariffs: toMinorUnits(value.tariffs),
          miscFees: toMinorUnits(value.miscFees),
          notes: value.notes,
        };
        await callbackFn(transformedValue, cascadeOptions);
      } else if (type === "split") {
        const transformedValue: NewOrder = {
          title: value.title,
          shop: value.shop,
          orderDate: value.orderDate || null,
          releaseDate: value.releaseDate || null,
          paymentDate: value.paymentDate || null,
          shippingDate: value.shippingDate || null,
          collectionDate: value.collectionDate || null,
          status: value.status,
          shippingMethod: value.shippingMethod || "n/a",
          shippingFee: toMinorUnits(value.shippingFee),
          taxes: toMinorUnits(value.taxes),
          duties: toMinorUnits(value.duties),
          tariffs: toMinorUnits(value.tariffs),
          miscFees: toMinorUnits(value.miscFees),
          notes: value.notes,
        };
        await callbackFn(transformedValue, cascadeOptions, collectionIds, orderIds);
        clearSelections?.();
      } else {
        const transformedValue: NewOrder = {
          title: value.title,
          shop: value.shop,
          orderDate: value.orderDate || null,
          releaseDate: value.releaseDate || null,
          paymentDate: value.paymentDate || null,
          shippingDate: value.shippingDate || null,
          collectionDate: value.collectionDate || null,
          status: value.status,
          shippingMethod: value.shippingMethod || "n/a",
          shippingFee: toMinorUnits(value.shippingFee),
          taxes: toMinorUnits(value.taxes),
          duties: toMinorUnits(value.duties),
          tariffs: toMinorUnits(value.tariffs),
          miscFees: toMinorUnits(value.miscFees),
          notes: value.notes,
        };
        await callbackFn(transformedValue, cascadeOptions, orderIds);
        clearSelections?.();
      }
    },
  });

  if (type === "edit-order") {
    return (
      <Sheet>
        <SheetTrigger asChild>{renderTrigger}</SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-lg h-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <SheetHeader>
              <SheetTitle>Edit Order</SheetTitle>
              <SheetDescription>
                {orderData ? orderData.title : "Edit the selected order."}
              </SheetDescription>
            </SheetHeader>
            <Scroller className="max-h-[70vh] px-2">
              <div className="grid gap-4 p-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Cascade Order Details to Items</Label>
                    <CascadeOptionsDropdown
                      cascadeOptions={cascadeOptions}
                      cascadeDisplayText={cascadeDisplayText}
                      cascadeOptionsList={cascadeOptionsList}
                      handleSelectAll={handleSelectAll}
                      handleSelectNone={handleSelectNone}
                      handleCascadeOptionChange={handleCascadeOptionChange}
                    />
                  </div>

                  <form.Field
                    name="status"
                    validators={{
                      onChange: z.enum(ORDER_STATUSES, "Status is required"),
                    }}
                    children={(field) => (
                      <div className="grid gap-2">
                        <Label htmlFor={field.name}>Status</Label>
                        <Select
                          value={field.state.value}
                          onValueChange={(value) =>
                            field.handleChange(value as typeof field.state.value)
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
                        {field.state.meta.errors && field.state.meta.errors.length > 0 ? (
                          <p className="text-sm text-red-500">
                            {String(field.state.meta.errors[0])}
                          </p>
                        ) : null}
                      </div>
                    )}
                  />
                </div>

                <form.Field
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
                        type="text"
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Enter shop name"
                      />
                    </div>
                  )}
                />

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
                    name="releaseDate"
                    children={(field) => (
                      <div className="grid gap-2">
                        <Label htmlFor={field.name}>Release</Label>
                        <DatePicker
                          id={field.name}
                          name={field.name}
                          value={field.state.value ?? null}
                          onBlur={field.handleBlur}
                          onChange={(value) => field.handleChange(value)}
                          placeholder="Select release date"
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-2 gap-4">
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

                  <form.Field
                    name="shippingMethod"
                    validators={{
                      onChange: z.enum(SHIPPING_METHODS, "Shipping method is required"),
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

                <div className="grid grid-cols-2 gap-4">
                  <form.Field
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
                          onValueChange={(maskedValue, unmaskedValue) =>
                            field.handleChange(unmaskedValue)
                          }
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  />

                  <form.Field
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
                          onValueChange={(maskedValue, unmaskedValue) =>
                            field.handleChange(unmaskedValue)
                          }
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <form.Field
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
                          onValueChange={(maskedValue, unmaskedValue) =>
                            field.handleChange(unmaskedValue)
                          }
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  />

                  <form.Field
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
                          onValueChange={(maskedValue, unmaskedValue) =>
                            field.handleChange(unmaskedValue)
                          }
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  />
                </div>

                <form.Field
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
                        onValueChange={(maskedValue, unmaskedValue) =>
                          field.handleChange(unmaskedValue)
                        }
                        placeholder="0.00"
                      />
                    </div>
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
                        maxLength={1000}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Enter additional notes..."
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
                    <Button
                      type="submit"
                      disabled={!canSubmit || isSubmitting}
                      variant="primary"
                      className="w-full flex-1"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
                    </Button>
                  </SheetClose>
                )}
              />
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{renderTrigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{type === "merge" ? "Merge Orders" : "Split Items"}</DialogTitle>
            {selectedCount && (
              <DialogDescription>
                {type === "merge"
                  ? `Merge the selected ${selectedCount} orders into a new order.`
                  : `Split the selected ${selectedCount} items into a new order.`}
              </DialogDescription>
            )}
          </DialogHeader>

          <Scroller className="flex flex-col gap-4 max-h-[70vh] py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Cascade Order Details to Items</Label>
                <CascadeOptionsDropdown
                  cascadeOptions={cascadeOptions}
                  cascadeDisplayText={cascadeDisplayText}
                  cascadeOptionsList={cascadeOptionsList}
                  handleSelectAll={handleSelectAll}
                  handleSelectNone={handleSelectNone}
                  handleCascadeOptionChange={handleCascadeOptionChange}
                />
              </div>

              <form.Field
                name="status"
                validators={{
                  onChange: z.enum(ORDER_STATUSES, "Status is required"),
                }}
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Status</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as typeof field.state.value)
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
                    {field.state.meta.errors && field.state.meta.errors.length > 0 ? (
                      <p className="text-sm text-red-500">{String(field.state.meta.errors[0])}</p>
                    ) : null}
                  </div>
                )}
              />
            </div>

            <form.Field
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
                    <em role="alert">{field.state.meta.errors.join(", ")}</em>
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
                    type="text"
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Enter shop name"
                  />
                </div>
              )}
            />

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
                name="releaseDate"
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Release</Label>
                    <DatePicker
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? null}
                      onBlur={field.handleBlur}
                      onChange={(value) => field.handleChange(value)}
                      placeholder="Select release date"
                    />
                  </div>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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

              <form.Field
                name="shippingMethod"
                validators={{
                  onChange: z.enum(SHIPPING_METHODS, "Shipping method is required"),
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

            <div className="grid grid-cols-2 gap-4">
              <form.Field
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
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                      placeholder="0.00"
                    />
                  </div>
                )}
              />

              <form.Field
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
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                      placeholder="0.00"
                    />
                  </div>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <form.Field
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
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                      placeholder="0.00"
                    />
                  </div>
                )}
              />

              <form.Field
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
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                      placeholder="0.00"
                    />
                  </div>
                )}
              />
            </div>

            <form.Field
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
                    onValueChange={(maskedValue, unmaskedValue) =>
                      field.handleChange(unmaskedValue)
                    }
                    placeholder="0.00"
                  />
                </div>
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
                    maxLength={1000}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Enter additional notes..."
                  />
                </div>
              )}
            />
          </Scroller>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <DialogClose asChild>
                  <Button type="submit" disabled={!canSubmit} variant="primary">
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : type === "merge" ? (
                      "Merge"
                    ) : (
                      "Split"
                    )}
                  </Button>
                </DialogClose>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
