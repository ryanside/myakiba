import { optionalMinorUnits } from "@/lib/money-input";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftDialog } from "@/components/draft-dialog";
import { useForm } from "@tanstack/react-form";
import { Field, FieldContent, FieldTitle } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { VocabularyFilterField } from "@/components/vocabulary-fields";
import { MoneyField } from "@/components/money-field";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { FieldTrigger } from "@/components/ui/field-trigger";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RELEASE_MONTHS } from "@myakiba/contracts/orders/schema";
import type { OrdersPageSearch, ReleaseMonth } from "@myakiba/contracts/orders/schema";
import { minorUnitsToMajorString } from "@myakiba/utils/currency";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { Currency } from "@myakiba/contracts/shared/types";
import { formSubmitHandler } from "@/lib/form-submit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAID_CHOICES = { any: undefined, paid: true, unpaid: false } as const;
type PaidChoice = keyof typeof PAID_CHOICES;
const PAID_CHOICE_KEYS = ["any", "paid", "unpaid"] as const satisfies readonly PaidChoice[];
const PAID_CHOICE_LABELS = {
  any: "Paid or unpaid",
  paid: "Paid",
  unpaid: "Unpaid",
} satisfies Record<PaidChoice, string>;

const RELEASE_MONTH_LABELS = {
  this: "This month",
  next: "Next month",
} satisfies Record<ReleaseMonth, string>;

const isReleaseMonth = (value: string | undefined): value is ReleaseMonth =>
  RELEASE_MONTHS.some((month) => month === value);

function paidChoiceOf(paid: boolean | undefined): PaidChoice {
  if (paid === undefined) return "any";
  return paid ? "paid" : "unpaid";
}

interface OrdersFiltersFormProps {
  renderTrigger: React.ReactElement;
  currentFilters?: OrdersPageSearch;
  onApplyFilters: (filters: OrdersPageSearch) => void;
  currency: Currency;
}

export default function OrdersFiltersForm({
  renderTrigger,
  onApplyFilters,
  ...draftProps
}: OrdersFiltersFormProps): React.JSX.Element {
  return (
    <DraftDialog trigger={renderTrigger} className="sm:max-w-lg! px-0">
      {(close) => (
        <OrdersFiltersDraft
          {...draftProps}
          onApplyFilters={(filters) => {
            onApplyFilters(filters);
            close();
          }}
        />
      )}
    </DraftDialog>
  );
}

function OrdersFiltersDraft({
  currentFilters,
  onApplyFilters,
  currency,
}: Omit<OrdersFiltersFormProps, "renderTrigger">): React.JSX.Element {
  const form = useForm({
    defaultValues: {
      shop: currentFilters?.shop ?? [],
      releaseMonth: currentFilters?.releaseMonth ?? null,
      releaseDateStart: currentFilters?.releaseDateStart ?? "",
      releaseDateEnd: currentFilters?.releaseDateEnd ?? "",
      shipMethod: currentFilters?.shipMethod ?? [],
      orderDateStart: currentFilters?.orderDateStart ?? "",
      orderDateEnd: currentFilters?.orderDateEnd ?? "",
      payDateStart: currentFilters?.payDateStart ?? "",
      payDateEnd: currentFilters?.payDateEnd ?? "",
      shipDateStart: currentFilters?.shipDateStart ?? "",
      shipDateEnd: currentFilters?.shipDateEnd ?? "",
      colDateStart: currentFilters?.colDateStart ?? "",
      colDateEnd: currentFilters?.colDateEnd ?? "",
      status: currentFilters?.status ?? [],
      paid: paidChoiceOf(currentFilters?.paid),
      totalMin:
        currentFilters?.totalMin === undefined
          ? ""
          : minorUnitsToMajorString(currentFilters.totalMin),
      totalMax:
        currentFilters?.totalMax === undefined
          ? ""
          : minorUnitsToMajorString(currentFilters.totalMax),
      shippingFeeMin:
        currentFilters?.shippingFeeMin === undefined
          ? ""
          : minorUnitsToMajorString(currentFilters.shippingFeeMin),
      shippingFeeMax:
        currentFilters?.shippingFeeMax === undefined
          ? ""
          : minorUnitsToMajorString(currentFilters.shippingFeeMax),
    },
    onSubmit: async ({ value }) => {
      const filters: OrdersPageSearch = {
        shop: value.shop && value.shop.length > 0 ? value.shop : undefined,
        releaseMonth: value.releaseMonth ?? undefined,
        releaseDateStart: value.releaseDateStart || undefined,
        releaseDateEnd: value.releaseDateEnd || undefined,
        shipMethod: value.shipMethod && value.shipMethod.length > 0 ? value.shipMethod : undefined,
        orderDateStart: value.orderDateStart || undefined,
        orderDateEnd: value.orderDateEnd || undefined,
        payDateStart: value.payDateStart || undefined,
        payDateEnd: value.payDateEnd || undefined,
        shipDateStart: value.shipDateStart || undefined,
        shipDateEnd: value.shipDateEnd || undefined,
        colDateStart: value.colDateStart || undefined,
        colDateEnd: value.colDateEnd || undefined,
        status: value.status && value.status.length > 0 ? value.status : undefined,
        paid: PAID_CHOICES[value.paid],
        totalMin: optionalMinorUnits(value.totalMin),
        totalMax: optionalMinorUnits(value.totalMax),
        shippingFeeMin: optionalMinorUnits(value.shippingFeeMin),
        shippingFeeMax: optionalMinorUnits(value.shippingFeeMax),
      };

      onApplyFilters(filters);
    },
  });

  const getMultiSelectDisplay = (items: string[] | undefined, label: string): string => {
    if (!items || items.length === 0) return `Select ${label}`;
    if (items.length === 1 && items[0] !== undefined) return items[0];
    return `${items.length} selected`;
  };

  const handleSubmit = formSubmitHandler(form);

  const formFieldsContent = (
    <div className="grid gap-4">
      {/* Status */}
      <form.Field
        name="status"
        children={(field) => (
          <Field>
            <FieldTitle>Status</FieldTitle>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <FieldTrigger>{getMultiSelectDisplay(field.state.value, "status")}</FieldTrigger>
                }
              />
              <DropdownMenuContent className="w-(--anchor-width)">
                {ORDER_STATUSES.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={field.state.value?.includes(status)}
                    onCheckedChange={(checked) => {
                      const current = field.state.value || [];
                      const updated = checked
                        ? [...current, status]
                        : current.filter((s) => s !== status);
                      field.handleChange(updated);
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {status}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
        )}
      />

      <form.Field
        name="paid"
        children={(field) => (
          <Field>
            <FieldTitle>Paid</FieldTitle>
            <Select
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value as PaidChoice)}
            >
              <SelectTrigger className="w-full" aria-label="Paid">
                <SelectValue>{PAID_CHOICE_LABELS[field.state.value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAID_CHOICE_KEYS.map((choice) => (
                  <SelectItem key={choice} value={choice}>
                    {PAID_CHOICE_LABELS[choice]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />

      {/* Shipping Method */}
      <form.Field
        name="shipMethod"
        children={(field) => (
          <Field>
            <FieldTitle>Shipping Method</FieldTitle>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <FieldTrigger>
                    {getMultiSelectDisplay(field.state.value, "shipping method")}
                  </FieldTrigger>
                }
              />
              <DropdownMenuContent className="w-(--anchor-width)">
                <ScrollArea className="h-[200px]">
                  {SHIPPING_METHODS.map((method) => (
                    <DropdownMenuCheckboxItem
                      key={method}
                      checked={field.state.value?.includes(method)}
                      onCheckedChange={(checked) => {
                        const current = field.state.value || [];
                        const updated = checked
                          ? [...current, method]
                          : current.filter((m) => m !== method);
                        field.handleChange(updated);
                      }}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {method}
                    </DropdownMenuCheckboxItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
        )}
      />

      {/* Shop */}
      <form.Field
        name="shop"
        children={(field) => (
          <Field className="gap-2">
            <FieldTitle>Shop</FieldTitle>
            <FieldContent>
              <VocabularyFilterField
                filter="orderShops"
                value={field.state.value ?? []}
                onValueChange={field.handleChange}
              />
            </FieldContent>
          </Field>
        )}
      />

      {/* Date Range Filters */}
      <div className="space-y-4">
        {/* Release Date */}
        <Field>
          <Label>Release Date</Label>
          <form.Field
            name="releaseMonth"
            children={(field) => (
              <ToggleGroup
                value={field.state.value ? [field.state.value] : []}
                onValueChange={(values) => {
                  const month = values.find(isReleaseMonth) ?? null;
                  field.handleChange(month);
                  if (month === null) return;
                  form.setFieldValue("releaseDateStart", "");
                  form.setFieldValue("releaseDateEnd", "");
                }}
                variant="pill"
                size="sm"
                spacing={1.5}
                aria-label="Release Date"
              >
                {RELEASE_MONTHS.map((month) => (
                  <ToggleGroupItem key={month} value={month}>
                    {RELEASE_MONTH_LABELS[month]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
          <div className="grid grid-cols-2 gap-2">
            <form.Field
              name="releaseDateStart"
              children={(field) => (
                <DatePicker
                  placeholder="From"
                  value={field.state.value || null}
                  onChange={(value) => {
                    field.handleChange(value || "");
                    if (value) form.setFieldValue("releaseMonth", null);
                  }}
                />
              )}
            />
            <form.Field
              name="releaseDateEnd"
              children={(field) => (
                <DatePicker
                  placeholder="To"
                  value={field.state.value || null}
                  onChange={(value) => {
                    field.handleChange(value || "");
                    if (value) form.setFieldValue("releaseMonth", null);
                  }}
                />
              )}
            />
          </div>
        </Field>

        {/* Order Date */}
        <Field>
          <Label>Order Date</Label>
          <div className="grid grid-cols-2 gap-2">
            <form.Field
              name="orderDateStart"
              children={(field) => (
                <DatePicker
                  placeholder="From"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
            <form.Field
              name="orderDateEnd"
              children={(field) => (
                <DatePicker
                  placeholder="To"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
          </div>
        </Field>

        {/* Payment Date */}
        <Field>
          <Label>Payment Date</Label>
          <div className="grid grid-cols-2 gap-2">
            <form.Field
              name="payDateStart"
              children={(field) => (
                <DatePicker
                  placeholder="From"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
            <form.Field
              name="payDateEnd"
              children={(field) => (
                <DatePicker
                  placeholder="To"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
          </div>
        </Field>

        {/* Shipping Date */}
        <Field>
          <Label>Shipping Date</Label>
          <div className="grid grid-cols-2 gap-2">
            <form.Field
              name="shipDateStart"
              children={(field) => (
                <DatePicker
                  placeholder="From"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
            <form.Field
              name="shipDateEnd"
              children={(field) => (
                <DatePicker
                  placeholder="To"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
          </div>
        </Field>

        {/* Collection Date */}
        <Field>
          <Label>Collection Date</Label>
          <div className="grid grid-cols-2 gap-2">
            <form.Field
              name="colDateStart"
              children={(field) => (
                <DatePicker
                  placeholder="From"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
            <form.Field
              name="colDateEnd"
              children={(field) => (
                <DatePicker
                  placeholder="To"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
          </div>
        </Field>
      </div>

      {/* Total Range */}
      <Field>
        <FieldTitle>Total Range</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          <MoneyField form={form} name="totalMin" currency={currency} placeholder="Min" />
          <MoneyField form={form} name="totalMax" currency={currency} placeholder="Max" />
        </div>
      </Field>

      {/* Shipping Fee Range */}
      <Field>
        <FieldTitle>Shipping Fee Range</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          <MoneyField form={form} name="shippingFeeMin" currency={currency} placeholder="Min" />
          <MoneyField form={form} name="shippingFeeMax" currency={currency} placeholder="Max" />
        </div>
      </Field>
    </div>
  );

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="pb-4 px-4">
        <DialogTitle>Filters</DialogTitle>
        <DialogDescription>Apply filters to narrow down your orders</DialogDescription>
      </DialogHeader>

      <ScrollArea className="overflow-auto max-h-[60vh] pb-4 w-full">
        <div className="grid gap-4 px-4">{formFieldsContent}</div>
      </ScrollArea>

      <DialogFooter className="px-4! mx-0">
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
          children={([, isSubmitting]) => (
            <>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                Apply Filters
              </Button>
            </>
          )}
        />
      </DialogFooter>
    </form>
  );
}
