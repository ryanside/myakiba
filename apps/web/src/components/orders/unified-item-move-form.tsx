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
import { useState } from "react";
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
import type { NewOrder, CascadeOptions } from "@/lib/orders/types";
import { Loader2, ChevronsUpDownIcon, CheckIcon } from "lucide-react";
import { useCascadeOptions } from "@/hooks/use-cascade-options";
import { CascadeOptionsDropdown } from "@/components/cascade-options-dropdown";
import { Textarea } from "../ui/textarea";
import { cn } from "@/lib/utils";
import { getCurrencyLocale } from "@myakiba/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQuery } from "@tanstack/react-query";
import { getOrderIdsAndTitles } from "@/queries/orders";
import { DebouncedInput } from "@/components/debounced-input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "../ui/scroll-area";
import { Scroller } from "../ui/scroller";
import { SHIPPING_METHODS } from "@myakiba/constants";

type UnifiedItemMoveFormProps = {
  renderTrigger: React.ReactNode;
  selectedItemData: {
    orderIds: Set<string>;
    collectionIds: Set<string>;
  };
  onMoveToExisting: (
    targetOrderId: string,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
  onMoveToNew: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: Set<string>,
    orderIds: Set<string>
  ) => Promise<void>;
  clearSelections: () => void;
  currency?: string;
};

export default function UnifiedItemMoveForm({
  renderTrigger,
  selectedItemData,
  onMoveToExisting,
  onMoveToNew,
  clearSelections,
  currency,
}: UnifiedItemMoveFormProps) {
  const [moveMode, setMoveMode] = useState<"existing" | "new">("existing");

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

  const [filters, setFilters] = useState({
    title: "",
  });

  const [popoverOpen, setPopoverOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["orderIdsAndTitles", filters],
    queryFn: () => getOrderIdsAndTitles(filters),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: filters.title.length > 0 && moveMode === "existing",
  });

  const existingOrderForm = useForm({
    defaultValues: {
      targetOrderId: "",
    },
    onSubmit: async ({ value }) => {
      await onMoveToExisting(
        value.targetOrderId,
        selectedItemData.collectionIds,
        selectedItemData.orderIds
      );
      clearSelections();
    },
  });

  const newOrderForm = useForm({
    defaultValues: {
      status: "Ordered",
      title: "New Order",
      shop: "",
      orderDate: "",
      releaseMonthYear: "",
      paymentDate: "",
      shippingDate: "",
      collectionDate: "",
      shippingMethod: "n/a",
      shippingFee: "0.00",
      taxes: "0.00",
      duties: "0.00",
      tariffs: "0.00",
      miscFees: "0.00",
      notes: "",
    },
    onSubmit: async ({ value }) => {
      const transformedValue: NewOrder = {
        title: value.title,
        shop: value.shop,
        orderDate: value.orderDate || null,
        releaseMonthYear: value.releaseMonthYear || null,
        paymentDate: value.paymentDate || null,
        shippingDate: value.shippingDate || null,
        collectionDate: value.collectionDate || null,
        status: value.status as "Ordered" | "Paid" | "Shipped" | "Owned",
        shippingMethod: (value.shippingMethod || "n/a") as "n/a" | "EMS" | "SAL" | "AIRMAIL" | "SURFACE" | "FEDEX" | "DHL" | "Colissimo" | "UPS" | "Domestic",
        shippingFee: value.shippingFee,
        taxes: value.taxes,
        duties: value.duties,
        tariffs: value.tariffs,
        miscFees: value.miscFees,
        notes: value.notes,
      };
      await onMoveToNew(
        transformedValue,
        cascadeOptions,
        selectedItemData.collectionIds,
        selectedItemData.orderIds
      );
      clearSelections();
    },
  });

  const selectedCount = selectedItemData.collectionIds.size;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {renderTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
      <DialogHeader>
        <DialogTitle>Move Items</DialogTitle>
        <DialogDescription>
          Move the selected {selectedCount} item{selectedCount !== 1 ? "s" : ""}{" "}
          to an existing order or create a new order.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>Move to</Label>
          <RadioGroup
            value={moveMode}
            onValueChange={(value) => setMoveMode(value as "existing" | "new")}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="existing" id="existing" />
              <Label htmlFor="existing" className="font-normal cursor-pointer">
                Existing Order
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="new" id="new" />
              <Label htmlFor="new" className="font-normal cursor-pointer">
                New Order
              </Label>
            </div>
          </RadioGroup>
        </div>

        {moveMode === "existing" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              existingOrderForm.handleSubmit();
            }}
          >
            <ScrollArea className="gap-4 py-4 w-full overflow-auto">
              <existingOrderForm.Field
                name="targetOrderId"
                validators={{
                  onChange: z.string().nonempty("Target order id is required"),
                }}
                children={(field) => (
                  <div className="grid gap-2">
                    <Label htmlFor={field.name}>Select Order:</Label>
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={popoverOpen}
                          className="w-full justify-between"
                          type="button"
                        >
                          {field.state.value
                            ? data?.orderIdsAndTitles?.find(
                                (order) => order.id === field.state.value
                              )?.title || "Select target order"
                            : "Select target order"}
                          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                        <Command>
                          <DebouncedInput
                            value={filters.title}
                            onChange={(value) =>
                              setFilters({ title: value.toString() })
                            }
                            placeholder="Search by title..."
                            debounce={200}
                            className="rounded-none shadow-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-background"
                          />
                          {data?.orderIdsAndTitles &&
                            data.orderIdsAndTitles.length > 0 && (
                              <CommandList className="space-y-2 p-1">
                                {error && (
                                  <CommandEmpty>
                                    Error searching orders: {error.message}
                                  </CommandEmpty>
                                )}
                                {data.orderIdsAndTitles.length === 0 &&
                                  !isLoading &&
                                  !error && (
                                    <CommandEmpty>No orders found.</CommandEmpty>
                                  )}
                                <CommandGroup>
                                  {data.orderIdsAndTitles.map((order) => (
                                    <CommandItem
                                      key={order.id}
                                      value={order.id}
                                      onSelect={() => {
                                        field.handleChange(order.id);
                                        setPopoverOpen(false);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          field.handleChange(order.id);
                                          setPopoverOpen(false);
                                        }
                                      }}
                                    >
                                      <CheckIcon
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.state.value === order.id
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                      />
                                      {order.title}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            )}
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {!field.state.meta.isValid && (
                      <em role="alert">{field.state.meta.errors.join(", ")}</em>
                    )}
                  </div>
                )}
              />
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </DialogClose>
              <existingOrderForm.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
                children={([canSubmit, isSubmitting]) => (
                  <DialogClose asChild>
                    <Button type="submit" disabled={!canSubmit} variant="primary">
                      {isSubmitting ? "Moving..." : "Move Items"}
                    </Button>
                  </DialogClose>
                )}
              />
            </DialogFooter>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              newOrderForm.handleSubmit();
            }}
          >
            <Scroller className="gap-4 py-4 w-full max-h-[60vh]">
              <div className="grid gap-4 pr-4">
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

                  <newOrderForm.Field
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

                <newOrderForm.Field
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

                <newOrderForm.Field
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
                  <newOrderForm.Field
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

                  <newOrderForm.Field
                    name="releaseMonthYear"
                    children={(field) => (
                      <div className="grid gap-2">
                        <Label htmlFor={field.name}>Release</Label>
                        <DatePicker
                          id={field.name}
                          name={field.name}
                          value={field.state.value ?? null}
                          onBlur={field.handleBlur}
                          onChange={(value) => field.handleChange(value ?? "")}
                          placeholder="Select release date"
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <newOrderForm.Field
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

                  <newOrderForm.Field
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <newOrderForm.Field
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

                  <newOrderForm.Field
                    name="shippingMethod"
                    validators={{
                      onChange: z.enum(
                        SHIPPING_METHODS,
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
                  <newOrderForm.Field
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

                  <newOrderForm.Field
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
                  <newOrderForm.Field
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

                  <newOrderForm.Field
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

                <newOrderForm.Field
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

                <newOrderForm.Field
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
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </DialogClose>
              <newOrderForm.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
                children={([canSubmit, isSubmitting]) => (
                  <DialogClose asChild>
                    <Button type="submit" disabled={!canSubmit} variant="primary">
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Move to New Order"
                      )}
                    </Button>
                  </DialogClose>
                )}
              />
            </DialogFooter>
          </form>
        )}
      </div>
    </DialogContent>
    </Dialog>
  );
}

