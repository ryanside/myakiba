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
import { useState } from "react";
import {
  Field,
  FieldContent,
  FieldTitle,
} from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MaskInput } from "@/components/ui/mask-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OrderFilters } from "@/lib/orders/types";
import { getCurrencyLocale } from "@/lib/utils";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/constants";

interface OrdersFiltersFormProps {
  renderTrigger: React.ReactNode;
  currentFilters?: OrderFilters;
  onApplyFilters: (filters: OrderFilters) => void;
  currency?: string;
}

export default function OrdersFiltersForm({
  renderTrigger,
  currentFilters,
  onApplyFilters,
  currency,
}: OrdersFiltersFormProps) {
  const [open, setOpen] = useState(false);
  const userCurrency = currency || "USD";
  const userLocale = getCurrencyLocale(userCurrency);

  const form = useForm({
    defaultValues: {
      shop: currentFilters?.shop ?? [],
      releaseMonthYearStart: currentFilters?.releaseMonthYearStart ?? "",
      releaseMonthYearEnd: currentFilters?.releaseMonthYearEnd ?? "",
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
      totalMin: currentFilters?.totalMin ?? "",
      totalMax: currentFilters?.totalMax ?? "",
      shippingFeeMin: currentFilters?.shippingFeeMin ?? "",
      shippingFeeMax: currentFilters?.shippingFeeMax ?? "",
      taxesMin: currentFilters?.taxesMin ?? "",
      taxesMax: currentFilters?.taxesMax ?? "",
      dutiesMin: currentFilters?.dutiesMin ?? "",
      dutiesMax: currentFilters?.dutiesMax ?? "",
      tariffsMin: currentFilters?.tariffsMin ?? "",
      tariffsMax: currentFilters?.tariffsMax ?? "",
      miscFeesMin: currentFilters?.miscFeesMin ?? "",
      miscFeesMax: currentFilters?.miscFeesMax ?? "",
    },
    onSubmit: async ({ value }) => {
      const filters: OrderFilters = {
        shop: value.shop && value.shop.length > 0 ? value.shop : undefined,
        releaseMonthYearStart: value.releaseMonthYearStart || undefined,
        releaseMonthYearEnd: value.releaseMonthYearEnd || undefined,
        shipMethod:
          value.shipMethod && value.shipMethod.length > 0
            ? value.shipMethod
            : undefined,
        orderDateStart: value.orderDateStart || undefined,
        orderDateEnd: value.orderDateEnd || undefined,
        payDateStart: value.payDateStart || undefined,
        payDateEnd: value.payDateEnd || undefined,
        shipDateStart: value.shipDateStart || undefined,
        shipDateEnd: value.shipDateEnd || undefined,
        colDateStart: value.colDateStart || undefined,
        colDateEnd: value.colDateEnd || undefined,
        status:
          value.status && value.status.length > 0 ? value.status : undefined,
        totalMin: value.totalMin || undefined,
        totalMax: value.totalMax || undefined,
        shippingFeeMin: value.shippingFeeMin || undefined,
        shippingFeeMax: value.shippingFeeMax || undefined,
        taxesMin: value.taxesMin || undefined,
        taxesMax: value.taxesMax || undefined,
        dutiesMin: value.dutiesMin || undefined,
        dutiesMax: value.dutiesMax || undefined,
        tariffsMin: value.tariffsMin || undefined,
        tariffsMax: value.tariffsMax || undefined,
        miscFeesMin: value.miscFeesMin || undefined,
        miscFeesMax: value.miscFeesMax || undefined,
      };

      onApplyFilters(filters);
      setOpen(false);
    },
  });

  const getMultiSelectDisplay = (
    items: string[] | undefined,
    label: string
  ): string => {
    if (!items || items.length === 0) return `Select ${label}`;
    if (items.length === 1) return items[0];
    return `${items.length} selected`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {renderTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[100vh]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>
              Apply filters to narrow down your orders
            </DialogDescription>
          </DialogHeader>

        <ScrollArea className="overflow-auto max-h-[70vh]">
          <div className="grid gap-4 p-2">
            {/* Status */}
            <form.Field
              name="status"
              children={(field) => (
                <Field>
                  <FieldTitle>Status</FieldTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        type="button"
                      >
                        {getMultiSelectDisplay(field.state.value, "status")}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
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
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        type="button"
                      >
                        {getMultiSelectDisplay(
                          field.state.value,
                          "shipping method"
                        )}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
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
                              field.handleChange(
                                current.filter((_, idx) => idx !== shopIndex)
                              );
                            }}
                            className=" hover:text-red-500 hover:bg-transparent"
                          >
                            <X />
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
                    name="releaseMonthYearStart"
                    children={(field) => (
                      <DatePicker
                        placeholder="From"
                        value={field.state.value || null}
                        onChange={(value) => field.handleChange(value || "")}
                      />
                    )}
                  />
                  <form.Field
                    name="releaseMonthYearEnd"
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
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Min"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                    />
                  )}
                />
                <form.Field
                  name="totalMax"
                  children={(field) => (
                    <MaskInput
                      mask="currency"
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Max"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
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
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Min"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                    />
                  )}
                />
                <form.Field
                  name="shippingFeeMax"
                  children={(field) => (
                    <MaskInput
                      mask="currency"
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Max"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
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
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Min"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                    />
                  )}
                />
                <form.Field
                  name="taxesMax"
                  children={(field) => (
                    <MaskInput
                      mask="currency"
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Max"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
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
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Min"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                    />
                  )}
                />
                <form.Field
                  name="dutiesMax"
                  children={(field) => (
                    <MaskInput
                      mask="currency"
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Max"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
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
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Min"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                    />
                  )}
                />
                <form.Field
                  name="tariffsMax"
                  children={(field) => (
                    <MaskInput
                      mask="currency"
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Max"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
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
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Min"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                    />
                  )}
                />
                <form.Field
                  name="miscFeesMax"
                  children={(field) => (
                    <MaskInput
                      mask="currency"
                      currency={userCurrency}
                      locale={userLocale}
                      placeholder="Max"
                      value={field.state.value || ""}
                      onValueChange={(maskedValue, unmaskedValue) =>
                        field.handleChange(unmaskedValue)
                      }
                    />
                  )}
                />
              </div>
            </Field>
          </div>
        </ScrollArea>

        <DialogFooter className="">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <DialogClose asChild>
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

