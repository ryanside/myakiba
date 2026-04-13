import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
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
import { PopoverReleaseDateCell } from "@/components/cells/popover-release-date-cell";
import { FormSection } from "@/components/ui/form-section";
import * as z from "zod";
import type { EditedOrder, NewOrder, CascadeOptions } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { useCascadeOptions } from "@/hooks/use-cascade-options";
import { CascadeOptionsDropdown } from "@/components/cascade-options-dropdown";
import { Textarea } from "../ui/textarea";
import { majorStringToMinorUnits, minorUnitsToMajorString } from "@myakiba/utils/currency";
import { Scroller } from "../ui/scroller";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import { useState } from "react";
import { getCurrencyLocale } from "@/lib/locale";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import type { Currency } from "@myakiba/contracts/shared/types";

type MergeOrderFormProps = {
  renderTrigger: React.ReactElement;
  orderIds: ReadonlySet<string>;
  collectionIds?: ReadonlySet<string>;
  type: "merge";
  callbackFn: (
    value: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: ReadonlySet<string>,
  ) => Promise<void>;
  clearSelections: () => void;
  currency: Currency;
};

type SplitOrderFormProps = {
  renderTrigger: React.ReactElement;
  orderIds: ReadonlySet<string>;
  collectionIds: ReadonlySet<string>;
  type: "split";
  callbackFn: (
    value: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
    orderIds: ReadonlySet<string>,
  ) => Promise<void>;
  clearSelections: () => void;
  currency: Currency;
};

type EditOrderFormProps = {
  renderTrigger: React.ReactElement;
  orderIds?: ReadonlySet<string>;
  collectionIds?: ReadonlySet<string>;
  type: "edit-order";
  callbackFn: (value: EditedOrder, cascadeOptions: CascadeOptions) => Promise<void>;
  orderData: Order;
  clearSelections?: () => void;
  currency: Currency;
};

type OrderFormProps = MergeOrderFormProps | SplitOrderFormProps | EditOrderFormProps;
type DeferredMergeOrderFormProps = Omit<MergeOrderFormProps, "renderTrigger">;
type DeferredSplitOrderFormProps = Omit<SplitOrderFormProps, "renderTrigger">;
type DeferredEditOrderFormProps = Omit<EditOrderFormProps, "renderTrigger">;

export function OrderForm(props: OrderFormProps) {
  const { renderTrigger, type } = props;
  const [open, setOpen] = useState(false);

  if (type === "edit-order") {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={renderTrigger} />
        {open ? <OrderFormContent {...props} close={() => setOpen(false)} /> : null}
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={renderTrigger} />
      {open ? <OrderFormContent {...props} close={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function OrderFormContent(
  props: (
    | DeferredMergeOrderFormProps
    | DeferredSplitOrderFormProps
    | DeferredEditOrderFormProps
  ) & {
    readonly close: () => void;
  },
) {
  const { type, currency, close } = props;
  const userLocale = getCurrencyLocale(currency);

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
      ? (props as DeferredMergeOrderFormProps).orderIds.size
      : type === "split"
        ? (props as DeferredSplitOrderFormProps).collectionIds.size
        : undefined;
  const orderData =
    type === "edit-order" ? (props as DeferredEditOrderFormProps).orderData : undefined;

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
      const base = {
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

      if (type === "edit-order") {
        const { callbackFn } = props as DeferredEditOrderFormProps;
        const transformedValue: EditedOrder = { orderId: orderData!.orderId, ...base };
        await callbackFn(transformedValue, cascadeOptions);
        close();
      } else if (type === "split") {
        const { callbackFn, collectionIds, orderIds, clearSelections } =
          props as DeferredSplitOrderFormProps;
        await callbackFn(base as NewOrder, cascadeOptions, collectionIds, orderIds);
        clearSelections?.();
        close();
      } else {
        const { callbackFn, orderIds, clearSelections } = props as DeferredMergeOrderFormProps;
        await callbackFn(base as NewOrder, cascadeOptions, orderIds);
        clearSelections?.();
        close();
      }
    },
  });

  const formFields = (
    <div className="flex flex-col gap-3 p-2">
      <FormSection title="Basics">
        <form.Field
          name="title"
          validators={{ onChange: z.string().nonempty("Title is required") }}
          children={(field) => (
            <div className="grid gap-1.5">
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
                <p role="alert" className="text-xs text-destructive">
                  {field.state.meta.errors[0]?.message}
                </p>
              )}
            </div>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <form.Field
            name="status"
            validators={{ onChange: z.enum(ORDER_STATUSES, "Status is required") }}
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Status</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as typeof field.state.value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status">
                      {field.state.value && (
                        <span className="flex items-center gap-2">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${ORDER_STATUS_COLORS[field.state.value] ?? "bg-muted"}`}
                          />
                          {field.state.value}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${ORDER_STATUS_COLORS[status] ?? "bg-muted"}`}
                          />
                          {status}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.state.meta.errors.length > 0 && (
                  <p role="alert" className="text-xs text-destructive">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
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
                  type="text"
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter shop name"
                />
              </div>
            )}
          />
        </div>
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
            name="releaseDate"
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Release</Label>
                {type === "edit-order" ? (
                  <PopoverReleaseDateCell
                    value={field.state.value ?? null}
                    orderId={orderData?.orderId}
                    onSubmit={async (value) => field.handleChange(value)}
                    triggerVariant="outline"
                    triggerClassName="w-full justify-start"
                    placeholder="Select release"
                  />
                ) : (
                  <DatePicker
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? null}
                    onBlur={field.handleBlur}
                    onChange={(value) => field.handleChange(value)}
                    placeholder="Select date"
                  />
                )}
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div className="grid grid-cols-2 gap-3">
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

          <form.Field
            name="shippingMethod"
            validators={{ onChange: z.enum(SHIPPING_METHODS, "Shipping method is required") }}
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Shipping Method</Label>
                <Select
                  value={field.state.value ?? ""}
                  onValueChange={(value) => field.handleChange(value as typeof field.state.value)}
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
        </div>
      </FormSection>

      <FormSection title="Fees & Charges">
        <div className="grid grid-cols-2 gap-3">
          <form.Field
            name="shippingFee"
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Shipping</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={currency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(_maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />

          <form.Field
            name="taxes"
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Taxes</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={currency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(_maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form.Field
            name="duties"
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Duties</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={currency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(_maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />

          <form.Field
            name="tariffs"
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Tariffs</Label>
                <MaskInput
                  id={field.name}
                  name={field.name}
                  mask="currency"
                  currency={currency}
                  locale={userLocale}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onValueChange={(_maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                  placeholder="0.00"
                />
              </div>
            )}
          />
        </div>

        <form.Field
          name="miscFees"
          children={(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>Miscellaneous</Label>
              <MaskInput
                id={field.name}
                name={field.name}
                mask="currency"
                currency={currency}
                locale={userLocale}
                value={field.state.value}
                onBlur={field.handleBlur}
                onValueChange={(_maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
                placeholder="0.00"
              />
            </div>
          )}
        />
      </FormSection>

      <FormSection title="Options" defaultOpen={false}>
        <div className="grid gap-1.5">
          <Label>Cascade to Items</Label>
          <CascadeOptionsDropdown
            cascadeOptions={cascadeOptions}
            cascadeDisplayText={cascadeDisplayText}
            cascadeOptionsList={cascadeOptionsList}
            handleSelectAll={handleSelectAll}
            handleSelectNone={handleSelectNone}
            handleCascadeOptionChange={handleCascadeOptionChange}
          />
        </div>
      </FormSection>

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
                maxLength={1000}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Add any notes..."
                rows={3}
              />
            </div>
          )}
        />
      </FormSection>
    </div>
  );

  if (type === "edit-order") {
    return (
      <SheetContent side="right" className="w-full sm:max-w-lg! h-full">
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
          <Scroller className="max-h-[70vh] px-2">{formFields}</Scroller>
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
                  variant="default"
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
    );
  }

  return (
    <DialogContent className="sm:max-w-lg!">
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

        <Scroller className="max-h-[70vh] py-4 no-scrollbar">{formFields}</Scroller>

        <DialogFooter>
          <form.Subscribe
            selector={(state) => [state.isSubmitting]}
            children={([isSubmitting]) => (
              <DialogClose>
                <Button variant="outline" type="button" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
            )}
          />
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting} variant="default">
                {isSubmitting ? (
                  <HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
                ) : type === "merge" ? (
                  "Merge"
                ) : (
                  "Split"
                )}
              </Button>
            )}
          />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
