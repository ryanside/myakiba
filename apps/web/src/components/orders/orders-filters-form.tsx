import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
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
import { useForm } from "@tanstack/react-form";
import { Field, FieldContent, FieldTitle } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MaskInput } from "@/components/ui/mask-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OrderFilters } from "@myakiba/contracts/orders/schema";
import { majorStringToMinorUnits, minorUnitsToMajorString } from "@myakiba/utils/currency";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { Currency } from "@myakiba/contracts/shared/types";
import { getCurrencyLocale } from "@/lib/locale";

interface OrdersFiltersFormProps {
  renderTrigger: React.ReactElement;
  currentFilters?: OrderFilters;
  onApplyFilters: (filters: OrderFilters) => void;
  currency: Currency;
}

export default function OrdersFiltersForm({
  renderTrigger,
  currentFilters,
  onApplyFilters,
  currency,
}: OrdersFiltersFormProps) {
  const userLocale = getCurrencyLocale(currency);

  const form = useForm({
    defaultValues: {
      shop: currentFilters?.shop ?? [],
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
      totalMin:
        currentFilters?.totalMin !== undefined
          ? minorUnitsToMajorString(currentFilters.totalMin)
          : "",
      totalMax:
        currentFilters?.totalMax !== undefined
          ? minorUnitsToMajorString(currentFilters.totalMax)
          : "",
      shippingFeeMin:
        currentFilters?.shippingFeeMin !== undefined
          ? minorUnitsToMajorString(currentFilters.shippingFeeMin)
          : "",
      shippingFeeMax:
        currentFilters?.shippingFeeMax !== undefined
          ? minorUnitsToMajorString(currentFilters.shippingFeeMax)
          : "",
      taxesMin:
        currentFilters?.taxesMin !== undefined
          ? minorUnitsToMajorString(currentFilters.taxesMin)
          : "",
      taxesMax:
        currentFilters?.taxesMax !== undefined
          ? minorUnitsToMajorString(currentFilters.taxesMax)
          : "",
      dutiesMin:
        currentFilters?.dutiesMin !== undefined
          ? minorUnitsToMajorString(currentFilters.dutiesMin)
          : "",
      dutiesMax:
        currentFilters?.dutiesMax !== undefined
          ? minorUnitsToMajorString(currentFilters.dutiesMax)
          : "",
      tariffsMin:
        currentFilters?.tariffsMin !== undefined
          ? minorUnitsToMajorString(currentFilters.tariffsMin)
          : "",
      tariffsMax:
        currentFilters?.tariffsMax !== undefined
          ? minorUnitsToMajorString(currentFilters.tariffsMax)
          : "",
      miscFeesMin:
        currentFilters?.miscFeesMin !== undefined
          ? minorUnitsToMajorString(currentFilters.miscFeesMin)
          : "",
      miscFeesMax:
        currentFilters?.miscFeesMax !== undefined
          ? minorUnitsToMajorString(currentFilters.miscFeesMax)
          : "",
    },
    onSubmit: async ({ value }) => {
      const toMinorUnits = (amount: string): number | undefined =>
        amount.trim() === "" ? undefined : majorStringToMinorUnits(amount);
      const filters: OrderFilters = {
        shop: value.shop && value.shop.length > 0 ? value.shop : undefined,
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
        totalMin: toMinorUnits(value.totalMin),
        totalMax: toMinorUnits(value.totalMax),
        shippingFeeMin: toMinorUnits(value.shippingFeeMin),
        shippingFeeMax: toMinorUnits(value.shippingFeeMax),
        taxesMin: toMinorUnits(value.taxesMin),
        taxesMax: toMinorUnits(value.taxesMax),
        dutiesMin: toMinorUnits(value.dutiesMin),
        dutiesMax: toMinorUnits(value.dutiesMax),
        tariffsMin: toMinorUnits(value.tariffsMin),
        tariffsMax: toMinorUnits(value.tariffsMax),
        miscFeesMin: toMinorUnits(value.miscFeesMin),
        miscFeesMax: toMinorUnits(value.miscFeesMax),
      };

      onApplyFilters(filters);
    },
  });

  const getMultiSelectDisplay = (items: string[] | undefined, label: string): string => {
    if (!items || items.length === 0) return `Select ${label}`;
    if (items.length === 1) return items[0];
    return `${items.length} selected`;
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    form.handleSubmit();
  };

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
                  <Button variant="outline" className="w-full justify-between" type="button">
                    {getMultiSelectDisplay(field.state.value, "status")}
                    <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" />
                  </Button>
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

      {/* Shipping Method */}
      <form.Field
        name="shipMethod"
        children={(field) => (
          <Field>
            <FieldTitle>Shipping Method</FieldTitle>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" className="w-full justify-between" type="button">
                    {getMultiSelectDisplay(field.state.value, "shipping method")}
                    <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" />
                  </Button>
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
              <div className="flex flex-wrap gap-2">
                {field.state.value?.map((shop, shopIndex) => (
                  <Badge
                    key={shopIndex}
                    variant="outline"
                    size="lg"
                    className="flex items-center justify-between pr-0"
                  >
                    {shop}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const current = field.state.value || [];
                        field.handleChange(current.filter((_, idx) => idx !== shopIndex));
                      }}
                      className=" hover:text-red-500 hover:bg-transparent"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} />
                    </Button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="shop-input"
                  type="text"
                  placeholder="Press enter after each shop to add"
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

      {/* Date Range Filters */}
      <div className="space-y-4">
        {/* Release Date */}
        <Field>
          <Label>Release Date</Label>
          <div className="grid grid-cols-2 gap-2">
            <form.Field
              name="releaseDateStart"
              children={(field) => (
                <DatePicker
                  placeholder="From"
                  value={field.state.value || null}
                  onChange={(value) => field.handleChange(value || "")}
                />
              )}
            />
            <form.Field
              name="releaseDateEnd"
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
          <form.Field
            name="totalMin"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Min"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
          <form.Field
            name="totalMax"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Max"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
        </div>
      </Field>

      {/* Shipping Fee Range */}
      <Field>
        <FieldTitle>Shipping Fee Range</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          <form.Field
            name="shippingFeeMin"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Min"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
          <form.Field
            name="shippingFeeMax"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Max"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
        </div>
      </Field>

      {/* Taxes Range */}
      <Field>
        <FieldTitle>Taxes Range</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          <form.Field
            name="taxesMin"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Min"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
          <form.Field
            name="taxesMax"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Max"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
        </div>
      </Field>

      {/* Duties Range */}
      <Field>
        <FieldTitle>Duties Range</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          <form.Field
            name="dutiesMin"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Min"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
          <form.Field
            name="dutiesMax"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Max"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
        </div>
      </Field>

      {/* Tariffs Range */}
      <Field>
        <FieldTitle>Tariffs Range</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          <form.Field
            name="tariffsMin"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Min"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
          <form.Field
            name="tariffsMax"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Max"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
        </div>
      </Field>

      {/* Misc Fees Range */}
      <Field>
        <FieldTitle>Misc Fees Range</FieldTitle>
        <div className="grid grid-cols-2 gap-2">
          <form.Field
            name="miscFeesMin"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Min"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
          <form.Field
            name="miscFeesMax"
            children={(field) => (
              <MaskInput
                mask="currency"
                currency={currency}
                locale={userLocale}
                placeholder="Max"
                value={field.state.value || ""}
                onValueChange={(maskedValue, unmaskedValue) => field.handleChange(unmaskedValue)}
              />
            )}
          />
        </div>
      </Field>
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger render={renderTrigger} />
      <DialogContent className="sm:max-w-lg! px-0">
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
                  <DialogClose>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
                      Apply Filters
                    </Button>
                  </DialogClose>
                </>
              )}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
