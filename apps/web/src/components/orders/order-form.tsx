import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { z } from "zod";
import type { EditedOrder, NewOrder, Order } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { CascadeOptions } from "@/lib/types";
import { useCascadeOptions } from "@/hooks/use-cascade-options";

type MergeOrderFormProps = {
  orderIds: Set<string>;
  collectionIds?: Set<string>;
  type: "merge";
  callbackFn: (
    value: NewOrder,
    cascadeOptions: CascadeOptions,
    orderIds: Set<string>
  ) => Promise<void>;
  clearSelections: () => void;
};

type SplitOrderFormProps = {
  orderIds: Set<string>;
  collectionIds: Set<string>;
  type: "split";
  callbackFn: (
    value: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
  clearSelections: () => void;
};

type EditOrderFormProps = {
  orderIds?: Set<string>;
  collectionIds?: Set<string>;
  type: "edit-order";
  callbackFn: (
    value: EditedOrder,
    cascadeOptions: CascadeOptions
  ) => Promise<void>;
  orderData: Order;
  clearSelections?: () => void;
};

type OrderFormProps =
  | MergeOrderFormProps
  | SplitOrderFormProps
  | EditOrderFormProps;

export function OrderForm(props: OrderFormProps) {
  const { callbackFn, type, orderIds, collectionIds, clearSelections } = props;

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

  const form = useForm({
    defaultValues: orderData || {
      status: "Ordered" as const,
      title:
        type === "merge"
          ? "New Merged Order"
          : type === "split"
            ? "New Split Order"
            : "Edit Order",
      shop: "",
      orderDate: "",
      releaseMonthYear: "",
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
          releaseMonthYear: value.releaseMonthYear || null,
          paymentDate: value.paymentDate || null,
          shippingDate: value.shippingDate || null,
          collectionDate: value.collectionDate || null,
          status: value.status,
          shippingMethod: value.shippingMethod || "n/a",
          shippingFee: value.shippingFee,
          taxes: value.taxes,
          duties: value.duties,
          tariffs: value.tariffs,
          miscFees: value.miscFees,
          notes: value.notes,
        };
        await callbackFn(transformedValue, cascadeOptions);
      } else if (type === "split") {
        const transformedValue: NewOrder = {
          title: value.title,
          shop: value.shop,
          orderDate: value.orderDate || null,
          releaseMonthYear: value.releaseMonthYear || null,
          paymentDate: value.paymentDate || null,
          shippingDate: value.shippingDate || null,
          collectionDate: value.collectionDate || null,
          status: value.status,
          shippingMethod: value.shippingMethod || "n/a",
          shippingFee: value.shippingFee,
          taxes: value.taxes,
          duties: value.duties,
          tariffs: value.tariffs,
          miscFees: value.miscFees,
          notes: value.notes,
        };
        await callbackFn(
          transformedValue,
          cascadeOptions,
          collectionIds,
          orderIds
        );
        clearSelections?.();
      } else {
        const transformedValue: NewOrder = {
          title: value.title,
          shop: value.shop,
          orderDate: value.orderDate || null,
          releaseMonthYear: value.releaseMonthYear || null,
          paymentDate: value.paymentDate || null,
          shippingDate: value.shippingDate || null,
          collectionDate: value.collectionDate || null,
          status: value.status,
          shippingMethod: value.shippingMethod || "n/a",
          shippingFee: value.shippingFee,
          taxes: value.taxes,
          duties: value.duties,
          tariffs: value.tariffs,
          miscFees: value.miscFees,
          notes: value.notes,
        };
        await callbackFn(transformedValue, cascadeOptions, orderIds);
        clearSelections?.();
      }
    },
  });

  return (
    <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {type === "merge"
              ? "Merge Orders"
              : type === "split"
                ? "Split Items"
                : "Edit Order"}
          </DialogTitle>
          {selectedCount && (
            <DialogDescription>
              {type === "merge"
                ? `Merge the selected ${selectedCount} orders into a new order.`
                : type === "split"
                  ? `Split the selected ${selectedCount} items into a new order.`
                  : `Edit the selected order.`}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
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
                <DropdownMenuContent className="w-66">
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
                      checked={cascadeOptions.includes(
                        option as CascadeOptions[number]
                      )}
                      onCheckedChange={(checked) =>
                        handleCascadeOptionChange(
                          option as CascadeOptions[number],
                          checked
                        )
                      }
                    >
                      {option}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <form.Field
              name="status"
              validators={{
                onChange: z.enum(
                  ["Ordered", "Paid", "Shipped", "Owned"],
                  "Status is required"
                ),
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
                      <SelectItem value="Ordered">Ordered</SelectItem>
                      <SelectItem value="Owned">Owned</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Shipped">Shipped</SelectItem>
                    </SelectContent>
                  </Select>
                  {field.state.meta.errors &&
                  field.state.meta.errors.length > 0 ? (
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
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    type="date"
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            />

            <form.Field
              name="releaseMonthYear"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Release</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    type="date"
                    onChange={(e) => field.handleChange(e.target.value)}
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
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    type="date"
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            />

            <form.Field
              name="shippingDate"
              children={(field) => (
                <div className="grid gap-2">
                  <Label htmlFor={field.name}>Shipping Date</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    type="date"
                    onChange={(e) => field.handleChange(e.target.value)}
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
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    type="date"
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            />

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
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value ?? ""}
                    onBlur={field.handleBlur}
                    type="number"
                    step="0.01"
                    min="0.00"
                    onChange={(e) => field.handleChange(e.target.value)}
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
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    type="number"
                    step="0.01"
                    min="0.00"
                    onChange={(e) => field.handleChange(e.target.value)}
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
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    type="number"
                    step="0.01"
                    min="0.00"
                    onChange={(e) => field.handleChange(e.target.value)}
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
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    type="number"
                    step="0.01"
                    min="0.00"
                    onChange={(e) => field.handleChange(e.target.value)}
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
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  type="number"
                  step="0.01"
                  min="0.00"
                  onChange={(e) => field.handleChange(e.target.value)}
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
                <textarea
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
                  {isSubmitting
                    ? "Submitting..."
                    : type === "merge"
                      ? "Merge"
                      : type === "split"
                        ? "Split"
                        : "Update"}
                </Button>
              </DialogClose>
            )}
          />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
