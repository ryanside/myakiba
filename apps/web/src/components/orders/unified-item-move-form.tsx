import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpDownIcon, Loading03Icon } from "@hugeicons/core-free-icons";
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
import { useId, useState } from "react";
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
import { FormSection } from "@/components/ui/form-section";
import * as z from "zod";
import type { NewOrder, CascadeOptions } from "@myakiba/contracts/orders/schema";
import { useCascadeOptions } from "@/hooks/use-cascade-options";
import { CascadeOptionsDropdown } from "@/components/cascade-options-dropdown";
import { Textarea } from "../ui/textarea";
import { majorStringToMinorUnits } from "@myakiba/utils/currency";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchOrders } from "@/queries/search";
import { DebouncedInput } from "@/components/debounced-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "../ui/scroll-area";
import { Scroller } from "../ui/scroller";
import { SHIPPING_METHODS, ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { Currency, OrderStatus, ShippingMethod } from "@myakiba/contracts/shared/types";
import { getCurrencyLocale } from "@/lib/locale";
import { ORDER_STATUS_COLORS } from "@/lib/orders";
import type { SelectedCollectionItems } from "@/hooks/use-selection";

type UnifiedItemMoveFormProps = {
  readonly renderTrigger: React.ReactElement;
  readonly selectedItems: SelectedCollectionItems;
  onMoveToExisting: (
    targetOrderId: string,
    collectionIds: ReadonlySet<string>,
    orderIds?: ReadonlySet<string>,
  ) => Promise<void>;
  onMoveToNew: (
    values: NewOrder,
    cascadeOptions: CascadeOptions,
    collectionIds: ReadonlySet<string>,
  ) => Promise<void>;
  readonly clearSelections: () => void;
  readonly currency: Currency;
  readonly intent?: "move" | "add";
};

const ORDER_SEARCH_PAGE_SIZE = 20;

export default function UnifiedItemMoveForm({
  renderTrigger,
  selectedItems,
  onMoveToExisting,
  onMoveToNew,
  clearSelections,
  currency,
  intent = "move",
}: UnifiedItemMoveFormProps) {
  const [open, setOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<"existing" | "new">("existing");
  const targetOrderListId = useId();
  const sourceOrderIds = selectedItems.orderIds.size > 0 ? selectedItems.orderIds : undefined;
  const selectedCount = selectedItems.collectionIds.size;
  const actionLabel = intent === "add" ? "Assign" : "Move";
  const dialogTitle = intent === "add" ? "Assign Order" : "Move Items";
  const pendingActionLabel = intent === "add" ? "Assigning..." : "Moving...";
  const existingSubmitLabel = intent === "add" ? "Assign Order" : "Move Items";
  const newSubmitLabel = intent === "add" ? "Assign to New Order" : "Move to New Order";

  const userLocale = getCurrencyLocale(currency);

  const {
    cascadeOptions,
    handleSelectAll,
    handleSelectNone,
    handleCascadeOptionChange,
    cascadeDisplayText,
    cascadeOptionsList,
  } = useCascadeOptions();

  const [orderSearch, setOrderSearch] = useState({
    title: "",
  });

  const [popoverOpen, setPopoverOpen] = useState(false);

  const {
    data: orderPages,
    isPending: isOrdersPending,
    isFetchingNextPage: isFetchingMoreOrders,
    hasNextPage: hasMoreOrders,
    fetchNextPage: fetchMoreOrders,
    error: orderSearchError,
  } = useInfiniteQuery({
    queryKey: ["orderIdsAndTitles", orderSearch.title],
    queryFn: ({ pageParam }) =>
      searchOrders({
        title: orderSearch.title,
        limit: ORDER_SEARCH_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.orderIdsAndTitles.length < ORDER_SEARCH_PAGE_SIZE
        ? undefined
        : lastPageParam + ORDER_SEARCH_PAGE_SIZE,
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: orderSearch.title.length > 0 && moveMode === "existing",
  });

  const orderResults = orderPages?.pages.flatMap((page) => page.orderIdsAndTitles) ?? [];

  const existingOrderForm = useForm({
    defaultValues: {
      targetOrderId: "",
    },
    onSubmit: async ({ value }) => {
      await onMoveToExisting(value.targetOrderId, selectedItems.collectionIds, sourceOrderIds);
      clearSelections();
      setOpen(false);
    },
  });

  const newOrderForm = useForm({
    defaultValues: {
      status: "Ordered" as OrderStatus,
      title: "New Order",
      shop: "",
      orderDate: "",
      releaseDate: "",
      paymentDate: "",
      shippingDate: "",
      collectionDate: "",
      shippingMethod: "n/a" as ShippingMethod,
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
        releaseDate: value.releaseDate || null,
        paymentDate: value.paymentDate || null,
        shippingDate: value.shippingDate || null,
        collectionDate: value.collectionDate || null,
        status: value.status,
        shippingMethod: value.shippingMethod,
        shippingFee: majorStringToMinorUnits(value.shippingFee),
        taxes: majorStringToMinorUnits(value.taxes),
        duties: majorStringToMinorUnits(value.duties),
        tariffs: majorStringToMinorUnits(value.tariffs),
        miscFees: majorStringToMinorUnits(value.miscFees),
        notes: value.notes,
      };
      await onMoveToNew(transformedValue, cascadeOptions, selectedItems.collectionIds);
      clearSelections();
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={renderTrigger} />
      <DialogContent className="sm:max-w-lg! px-0">
        <DialogHeader className="px-4">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {actionLabel} the selected {selectedCount} item{selectedCount !== 1 ? "s" : ""} to an
            existing order or create a new order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2 px-4">
            <Label>Destination</Label>
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
              <ScrollArea className="gap-4 py-4 mb-4 w-full overflow-auto">
                <div className="px-4">
                  <existingOrderForm.Field
                    name="targetOrderId"
                    validators={{
                      onChange: z.string().nonempty("Target order id is required"),
                    }}
                    children={(field) => (
                      <div className="grid gap-1.5">
                        <Label htmlFor={field.name}>Select Order:</Label>
                        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                          <PopoverTrigger
                            render={
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-controls={targetOrderListId}
                                aria-expanded={popoverOpen}
                                aria-haspopup="listbox"
                                className="w-full justify-between"
                                type="button"
                              >
                                {field.state.value
                                  ? orderResults.find((order) => order.id === field.state.value)
                                      ?.title || "Select target order"
                                  : "Select target order"}
                                <HugeiconsIcon
                                  icon={ArrowUpDownIcon}
                                  className="ml-2 h-4 w-4 shrink-0 opacity-50"
                                />
                              </Button>
                            }
                          />
                          <PopoverContent className="w-(--anchor-width) p-0">
                            <Command shouldFilter={false}>
                              <DebouncedInput
                                value={orderSearch.title}
                                onChange={(value) => setOrderSearch({ title: value.toString() })}
                                placeholder="Search orders by title..."
                                debounce={200}
                                isCommandInput
                              />
                              <CommandList id={targetOrderListId}>
                                {orderSearch.title.length === 0 && !orderSearchError && (
                                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    Type to search for orders
                                  </div>
                                )}
                                {orderSearchError && (
                                  <CommandEmpty>
                                    Could not load orders. {orderSearchError.message}
                                  </CommandEmpty>
                                )}
                                {orderSearch.title.length > 0 &&
                                  isOrdersPending &&
                                  !orderSearchError && (
                                    <div className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                                      <HugeiconsIcon
                                        icon={Loading03Icon}
                                        className="h-4 w-4 animate-spin"
                                      />
                                      Searching...
                                    </div>
                                  )}
                                {orderSearch.title.length > 0 &&
                                  orderResults.length === 0 &&
                                  !isOrdersPending &&
                                  !orderSearchError && (
                                    <CommandEmpty>No orders found.</CommandEmpty>
                                  )}
                                {orderResults.length > 0 && (
                                  <>
                                    <CommandGroup>
                                      {orderResults.map((order) => (
                                        <CommandItem
                                          key={order.id}
                                          value={order.id}
                                          data-checked={field.state.value === order.id}
                                          onSelect={() => {
                                            field.handleChange(order.id);
                                            setPopoverOpen(false);
                                          }}
                                        >
                                          {order.title}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                    {hasMoreOrders && (
                                      <div className="px-2 pb-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-center text-xs"
                                          onClick={() => void fetchMoreOrders()}
                                          disabled={isFetchingMoreOrders}
                                        >
                                          {isFetchingMoreOrders ? (
                                            <>
                                              <HugeiconsIcon
                                                icon={Loading03Icon}
                                                className="mr-1.5 h-3 w-3 animate-spin"
                                              />
                                              Loading...
                                            </>
                                          ) : (
                                            "Load more"
                                          )}
                                        </Button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {!field.state.meta.isValid && (
                          <p role="alert" className="text-xs text-destructive">
                            {field.state.meta.errors.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  />
                </div>
              </ScrollArea>
              <DialogFooter className="px-4! mx-0">
                <existingOrderForm.Subscribe
                  selector={(state) => [state.isSubmitting]}
                  children={([isSubmitting]) => (
                    <DialogClose>
                      <Button variant="outline" type="button" disabled={isSubmitting}>
                        Cancel
                      </Button>
                    </DialogClose>
                  )}
                />
                <existingOrderForm.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting]}
                  children={([canSubmit, isSubmitting]) => (
                    <Button type="submit" disabled={!canSubmit || isSubmitting} variant="default">
                      {isSubmitting ? pendingActionLabel : existingSubmitLabel}
                    </Button>
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
              <Scroller className="w-full max-h-[60vh] py-2">
                <div className="flex flex-col gap-3 px-4">
                  <FormSection title="Basics">
                    <div className="grid grid-cols-2 gap-3">
                      <newOrderForm.Field
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
                                {field.state.meta.errors.join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      />
                      <newOrderForm.Field
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
                    <div className="grid grid-cols-2 gap-3">
                      <newOrderForm.Field
                        name="status"
                        validators={{ onChange: z.enum(ORDER_STATUSES, "Status is required") }}
                        children={(field) => (
                          <div className="grid gap-1.5">
                            <Label htmlFor={field.name}>Status</Label>
                            <Select
                              value={field.state.value}
                              onValueChange={(value) =>
                                field.handleChange(value as typeof field.state.value)
                              }
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
                      <newOrderForm.Field
                        name="shippingMethod"
                        validators={{
                          onChange: z.enum(SHIPPING_METHODS, "Shipping method is required"),
                        }}
                        children={(field) => (
                          <div className="grid gap-1.5">
                            <Label htmlFor={field.name}>Shipping Method</Label>
                            <Select
                              value={field.state.value ?? ""}
                              onValueChange={(value) =>
                                field.handleChange(value as typeof field.state.value)
                              }
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

                  <FormSection title="Timeline">
                    <div className="grid grid-cols-2 gap-3">
                      <newOrderForm.Field
                        name="orderDate"
                        children={(field) => (
                          <div className="grid gap-1.5">
                            <Label htmlFor={field.name}>Order Date</Label>
                            <DatePicker
                              id={field.name}
                              name={field.name}
                              value={field.state.value ?? null}
                              onBlur={field.handleBlur}
                              onChange={(value) => field.handleChange(value ?? "")}
                              placeholder="Select date"
                            />
                          </div>
                        )}
                      />
                      <newOrderForm.Field
                        name="paymentDate"
                        children={(field) => (
                          <div className="grid gap-1.5">
                            <Label htmlFor={field.name}>Payment Date</Label>
                            <DatePicker
                              id={field.name}
                              name={field.name}
                              value={field.state.value ?? null}
                              onBlur={field.handleBlur}
                              onChange={(value) => field.handleChange(value ?? "")}
                              placeholder="Select date"
                            />
                          </div>
                        )}
                      />
                      <newOrderForm.Field
                        name="shippingDate"
                        children={(field) => (
                          <div className="grid gap-1.5">
                            <Label htmlFor={field.name}>Shipping Date</Label>
                            <DatePicker
                              id={field.name}
                              name={field.name}
                              value={field.state.value ?? null}
                              onBlur={field.handleBlur}
                              onChange={(value) => field.handleChange(value ?? "")}
                              placeholder="Select date"
                            />
                          </div>
                        )}
                      />
                      <newOrderForm.Field
                        name="collectionDate"
                        children={(field) => (
                          <div className="grid gap-1.5">
                            <Label htmlFor={field.name}>Collection Date</Label>
                            <DatePicker
                              id={field.name}
                              name={field.name}
                              value={field.state.value ?? null}
                              onBlur={field.handleBlur}
                              onChange={(value) => field.handleChange(value ?? "")}
                              placeholder="Select date"
                            />
                          </div>
                        )}
                      />
                    </div>
                  </FormSection>

                  <FormSection title="Fees & Charges">
                    <div className="grid grid-cols-2 gap-3">
                      <newOrderForm.Field
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
                              onValueChange={(_maskedValue, unmaskedValue) =>
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
                              onValueChange={(_maskedValue, unmaskedValue) =>
                                field.handleChange(unmaskedValue)
                              }
                              placeholder="0.00"
                            />
                          </div>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <newOrderForm.Field
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
                              onValueChange={(_maskedValue, unmaskedValue) =>
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
                              onValueChange={(_maskedValue, unmaskedValue) =>
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
                            onValueChange={(_maskedValue, unmaskedValue) =>
                              field.handleChange(unmaskedValue)
                            }
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
                    <newOrderForm.Field
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
              </Scroller>
              <DialogFooter className="px-4! mx-0">
                <newOrderForm.Subscribe
                  selector={(state) => [state.isSubmitting]}
                  children={([isSubmitting]) => (
                    <DialogClose>
                      <Button variant="outline" type="button" disabled={isSubmitting}>
                        Cancel
                      </Button>
                    </DialogClose>
                  )}
                />
                <newOrderForm.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting]}
                  children={([canSubmit, isSubmitting]) => (
                    <Button type="submit" disabled={!canSubmit || isSubmitting} variant="default">
                      {isSubmitting ? (
                        <HugeiconsIcon icon={Loading03Icon} className="w-4 h-4 animate-spin" />
                      ) : (
                        newSubmitLabel
                      )}
                    </Button>
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
