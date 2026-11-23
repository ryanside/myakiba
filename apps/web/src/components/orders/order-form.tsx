import { Result } from "better-result";
import { acceptedMoneyToMinorUnits } from "@/lib/money-input";
import { MoneyField } from "@/components/money-field";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import {
  StatusButton,
  closesOnSuccess,
  formSubmitStatus,
  useButtonStatus,
} from "@/components/ui/status-button";
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
import { ShopInput } from "@/components/vocabulary-fields";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";
import { useRead } from "@/data/client";
import { orders } from "@/data/resources/orders";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "../ui/textarea";
import { minorUnitsToMajorString } from "@myakiba/utils/currency";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import { useId, useMemo, useState } from "react";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import { PaidField } from "@/components/orders/payment";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { Saving } from "@/data/client";
import { formSubmitHandler } from "@/lib/form-submit";
import { cascadeToItems } from "@/lib/order-cascade";

type MergeOrderFormProps = {
  renderTrigger: React.ReactElement;
  orderIds: ReadonlySet<string>;
  type: "merge";
  callbackFn: (value: NewOrder, orderIds: ReadonlySet<string>) => Saving;
  clearSelections: () => void;
  currency: Currency;
};

type EditOrderFormProps = {
  renderTrigger: React.ReactElement;
  type: "edit-order";
  callbackFn: (value: EditedOrder, cascadeOptions: CascadeOptions) => Saving;
  orderData: Order;
  currency: Currency;
};

type OrderFormProps = MergeOrderFormProps | EditOrderFormProps;
type DeferredMergeOrderFormProps = Omit<MergeOrderFormProps, "renderTrigger">;
type DeferredEditOrderFormProps = Omit<EditOrderFormProps, "renderTrigger">;

export function OrderForm(props: OrderFormProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  if (props.type === "edit-order") {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={props.renderTrigger} />
        {open ? <OrderFormContent {...props} initial={props.orderData} close={close} /> : null}
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={props.renderTrigger} />
      {open ? <MergeOrderFormContent {...props} close={close} /> : null}
    </Dialog>
  );
}

const MERGED_ORDER_TITLE = "New Merged Order";
const NOTES_PAST_LIMIT = `The merged Orders' notes together pass the ${WRITE_LIMITS.notes.toLocaleString("en-US")}-character limit. Shorten them to merge.`;
const notesTooLong = (notes: string) => notes.length > WRITE_LIMITS.notes;
const mergedNotesFit = ({ value }: { readonly value: { readonly notes: string } }) =>
  notesTooLong(value.notes) ? NOTES_PAST_LIMIT : undefined;

function MergeOrderFormContent(
  props: DeferredMergeOrderFormProps & { readonly close: () => void },
) {
  const dialogOpening = useMemo(() => crypto.randomUUID(), []);
  const orderIds = [...props.orderIds].toSorted();
  const draft = useRead(orders.mergeDraft, { dialogOpening, orderIds });
  if (draft.isSuccess) {
    return (
      <OrderFormContent
        key={orderIds.join(",")}
        {...props}
        orderIds={new Set(orderIds)}
        initial={{ ...draft.data, title: MERGED_ORDER_TITLE }}
      />
    );
  }

  return (
    <DialogContent className="sm:max-w-lg!">
      <DialogHeader>
        <DialogTitle>Merge Orders</DialogTitle>
        <DialogDescription>{draft.isError ? draft.error.message : <Spinner />}</DialogDescription>
      </DialogHeader>
    </DialogContent>
  );
}

function OrderFormContent(
  props: (DeferredMergeOrderFormProps | DeferredEditOrderFormProps) & {
    readonly initial: NewOrder;
    readonly close: () => void;
  },
) {
  const { type, currency, initial, close } = props;
  const orderData =
    type === "edit-order" ? (props as DeferredEditOrderFormProps).orderData : undefined;

  const { status: buttonStatus, run } = useButtonStatus();
  const notesReasonId = useId();
  const alsoUpdateItemsId = useId();
  const [alsoUpdateItems, setAlsoUpdateItems] = useState(true);
  const form = useForm({
    validators: type === "merge" ? { onSubmit: mergedNotesFit } : {},
    defaultValues: {
      ...initial,
      shippingFee: minorUnitsToMajorString(initial.shippingFee),
      taxes: minorUnitsToMajorString(initial.taxes),
      duties: minorUnitsToMajorString(initial.duties),
      tariffs: minorUnitsToMajorString(initial.tariffs),
      miscFees: minorUnitsToMajorString(initial.miscFees),
    },
    onSubmit: ({ value }) =>
      run(async (): Saving => {
        const base: NewOrder = {
          title: value.title,
          shop: value.shop,
          orderDate: value.orderDate || null,
          releaseDate: value.releaseDate || null,
          paymentDate: value.paymentDate || null,
          shippingDate: value.shippingDate || null,
          collectionDate: value.collectionDate || null,
          status: value.status,
          paid: value.paid,
          shippingMethod: value.shippingMethod || "n/a",
          shippingFee: acceptedMoneyToMinorUnits(value.shippingFee),
          taxes: acceptedMoneyToMinorUnits(value.taxes),
          duties: acceptedMoneyToMinorUnits(value.duties),
          tariffs: acceptedMoneyToMinorUnits(value.tariffs),
          miscFees: acceptedMoneyToMinorUnits(value.miscFees),
          notes: value.notes,
        };

        if (type === "edit-order") {
          const { callbackFn, orderData: editOrderData } = props as DeferredEditOrderFormProps;
          const transformedValue: EditedOrder = { orderId: editOrderData.orderId, ...base };
          const changed = Object.entries(base)
            .filter(([field, edited]) => editOrderData[field as keyof NewOrder] !== edited)
            .map(([field]) => field);
          const saved = await callbackFn(
            transformedValue,
            alsoUpdateItems ? cascadeToItems(changed) : [],
          );
          // A failed write already rolled back and said why, so the form stays open to retry.
          if (saved.isErr()) return saved;
        } else {
          const { callbackFn, orderIds, clearSelections } = props as DeferredMergeOrderFormProps;
          const saved = await callbackFn(base, orderIds);
          if (saved.isErr()) return saved;
          clearSelections();
        }
        close();
        return Result.ok();
      }, closesOnSuccess),
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
                            className={`size-1.5 shrink-0 rounded-full ${ORDER_STATUS_COLORS[field.state.value]}`}
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
                            className={`size-1.5 shrink-0 rounded-full ${ORDER_STATUS_COLORS[status]}`}
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
            name="paid"
            children={(field) => (
              <PaidField
                id={field.name}
                paid={field.state.value}
                onPaidChange={field.handleChange}
              />
            )}
          />
        </div>

        <form.Field
          name="shop"
          children={(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={field.name}>Shop</Label>
              <ShopInput
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onValueChange={field.handleChange}
                placeholder="Enter shop name"
              />
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
            name="releaseDate"
            children={(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={field.name}>Release</Label>
                {type === "edit-order" ? (
                  <PopoverReleaseDateCell
                    value={field.state.value ?? null}
                    orderId={orderData?.orderId}
                    onSubmit={async (value) => {
                      field.handleChange(value);
                      return Result.ok();
                    }}
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
          <MoneyField
            form={form}
            name="shippingFee"
            currency={currency}
            placeholder="0.00"
            label="Shipping"
          />

          <MoneyField
            form={form}
            name="taxes"
            currency={currency}
            placeholder="0.00"
            label="Taxes"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MoneyField
            form={form}
            name="duties"
            currency={currency}
            placeholder="0.00"
            label="Duties"
          />

          <MoneyField
            form={form}
            name="tariffs"
            currency={currency}
            placeholder="0.00"
            label="Tariffs"
          />
        </div>

        <MoneyField
          form={form}
          name="miscFees"
          currency={currency}
          placeholder="0.00"
          label="Miscellaneous"
        />
      </FormSection>

      <FormSection title="Notes" defaultOpen={initial.notes.length > WRITE_LIMITS.notes}>
        <form.Field
          name="notes"
          children={(field) => (
            <div className="grid gap-1.5">
              <Textarea
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                maxLength={WRITE_LIMITS.notes}
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
        <form onSubmit={formSubmitHandler(form)}>
          <SheetHeader>
            <SheetTitle>Edit Order</SheetTitle>
            <SheetDescription>
              {orderData ? orderData.title : "Edit the selected order."}
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto max-h-[70vh] px-2 scroll-fade-b">{formFields}</div>
          {orderData && orderData.itemCount > 0 ? (
            <div className="flex items-center gap-2 px-4 pt-4">
              <Checkbox
                id={alsoUpdateItemsId}
                checked={alsoUpdateItems}
                onCheckedChange={(checked) => setAlsoUpdateItems(checked === true)}
              />
              <Label htmlFor={alsoUpdateItemsId} className="cursor-pointer">
                Also update matching items in this order
              </Label>
            </div>
          ) : null}
          <SheetFooter className="flex flex-row w-full">
            <form.Subscribe
              selector={(state) => [state.isSubmitting]}
              children={([isSubmitting]) => (
                <SheetClose
                  disabled={isSubmitting}
                  render={<Button type="button" variant="outline" />}
                >
                  Cancel
                </SheetClose>
              )}
            />
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting] as const}
              children={([canSubmit, isSubmitting]) => (
                <StatusButton
                  type="submit"
                  status={formSubmitStatus(buttonStatus, isSubmitting)}
                  disabled={!canSubmit}
                  variant="default"
                  className="w-full flex-1"
                >
                  Update
                </StatusButton>
              )}
            />
          </SheetFooter>
        </form>
      </SheetContent>
    );
  }

  return (
    <DialogContent className="sm:max-w-lg!">
      <form onSubmit={formSubmitHandler(form)}>
        <DialogHeader>
          <DialogTitle>Merge Orders</DialogTitle>
          <DialogDescription>
            Merge the selected {(props as DeferredMergeOrderFormProps).orderIds.size} orders into a
            new order.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] py-4 scroll-fade-b">{formFields}</div>

        <DialogFooter>
          <form.Subscribe
            selector={(state) => notesTooLong(state.values.notes)}
            children={(tooLong) =>
              tooLong ? (
                <p
                  id={notesReasonId}
                  role="alert"
                  className="text-xs text-destructive sm:mr-auto sm:self-center"
                >
                  {NOTES_PAST_LIMIT}
                </p>
              ) : null
            }
          />
          <form.Subscribe
            selector={(state) => [state.isSubmitting]}
            children={([isSubmitting]) => (
              <DialogClose
                disabled={isSubmitting}
                render={<Button variant="outline" type="button" />}
              >
                Cancel
              </DialogClose>
            )}
          />
          <form.Subscribe
            selector={(state) =>
              [state.canSubmit, state.isSubmitting, notesTooLong(state.values.notes)] as const
            }
            children={([canSubmit, isSubmitting, tooLong]) => (
              <StatusButton
                type="submit"
                status={formSubmitStatus(buttonStatus, isSubmitting)}
                disabled={!canSubmit || tooLong}
                aria-describedby={tooLong ? notesReasonId : undefined}
                variant="default"
              >
                Merge
              </StatusButton>
            )}
          />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
