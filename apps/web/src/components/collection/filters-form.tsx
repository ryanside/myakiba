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
  FieldDescription,
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
import type { CollectionFilters } from "@/lib/collection/types";
import { useQuery } from "@tanstack/react-query";
import { searchEntries } from "@/queries/collection";
import { DebouncedInput } from "@/components/debounced-input";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getCurrencyLocale } from "@myakiba/utils";
import {
  SHIPPING_METHODS,
  CONDITIONS,
  CURRENCIES,
  CATEGORIES,
} from "@myakiba/constants";

interface FiltersFormProps {
  renderTrigger: React.ReactNode;
  currentFilters?: CollectionFilters;
  onApplyFilters: (filters: CollectionFilters) => void;
  currency?: string;
}

export default function FiltersForm({
  renderTrigger,
  currentFilters,
  onApplyFilters,
  currency,
}: FiltersFormProps) {
  const userCurrency = currency || "USD";
  const userLocale = getCurrencyLocale(userCurrency);

  const form = useForm({
    defaultValues: {
      paidMin: currentFilters?.paidMin ?? "",
      paidMax: currentFilters?.paidMax ?? "",
      shop: currentFilters?.shop ?? [],
      payDateStart: currentFilters?.payDateStart ?? "",
      payDateEnd: currentFilters?.payDateEnd ?? "",
      shipDateStart: currentFilters?.shipDateStart ?? "",
      shipDateEnd: currentFilters?.shipDateEnd ?? "",
      colDateStart: currentFilters?.colDateStart ?? "",
      colDateEnd: currentFilters?.colDateEnd ?? "",
      shipMethod: currentFilters?.shipMethod ?? [],
      relDateStart: currentFilters?.relDateStart ?? "",
      relDateEnd: currentFilters?.relDateEnd ?? "",
      relPriceMin: currentFilters?.relPriceMin ?? "",
      relPriceMax: currentFilters?.relPriceMax ?? "",
      relCurrency: currentFilters?.relCurrency ?? [],
      category: currentFilters?.category ?? [],
      entries: currentFilters?.entries ?? [],
      scale: currentFilters?.scale ?? [],
      tags: currentFilters?.tags ?? [],
      condition: currentFilters?.condition ?? [],
    },
    onSubmit: async ({ value }) => {
      const filters: CollectionFilters = {
        paidMin: value.paidMin || undefined,
        paidMax: value.paidMax || undefined,
        shop: value.shop && value.shop.length > 0 ? value.shop : undefined,
        payDateStart: value.payDateStart || undefined,
        payDateEnd: value.payDateEnd || undefined,
        shipDateStart: value.shipDateStart || undefined,
        shipDateEnd: value.shipDateEnd || undefined,
        colDateStart: value.colDateStart || undefined,
        colDateEnd: value.colDateEnd || undefined,
        shipMethod:
          value.shipMethod && value.shipMethod.length > 0
            ? value.shipMethod
            : undefined,
        relDateStart: value.relDateStart || undefined,
        relDateEnd: value.relDateEnd || undefined,
        relPriceMin: value.relPriceMin || undefined,
        relPriceMax: value.relPriceMax || undefined,
        relCurrency:
          value.relCurrency && value.relCurrency.length > 0
            ? value.relCurrency
            : undefined,
        category:
          value.category && value.category.length > 0
            ? value.category
            : undefined,
        entries:
          value.entries && value.entries.length > 0 ? value.entries : undefined,
        scale: value.scale && value.scale.length > 0 ? value.scale : undefined,
        tags: value.tags && value.tags.length > 0 ? value.tags : undefined,
        condition:
          value.condition && value.condition.length > 0
            ? value.condition
            : undefined,
      };

      onApplyFilters(filters);
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

  const [filters, setFilters] = useState("");

  const {
    data: entries,
    isPending,
    error,
    isError,
  } = useQuery({
    queryKey: ["entries", filters],
    queryFn: () => searchEntries(filters),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: filters.length > 0,
  });

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
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>
              Apply filters to narrow down your collection
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="overflow-auto max-h-[70vh]">
            <div className="grid gap-4 p-2">
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
                      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
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

              {/* Condition */}
              <form.Field
                name="condition"
                children={(field) => (
                  <Field>
                    <FieldTitle>Condition</FieldTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between"
                          type="button"
                        >
                          {getMultiSelectDisplay(
                            field.state.value,
                            "condition"
                          )}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
                        {CONDITIONS.map((condition) => (
                          <DropdownMenuCheckboxItem
                            key={condition}
                            checked={field.state.value?.includes(condition)}
                            onCheckedChange={(checked) => {
                              const current = field.state.value || [];
                              const updated = checked
                                ? [...current, condition]
                                : current.filter((c) => c !== condition);
                              field.handleChange(updated);
                            }}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {condition}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Field>
                )}
              />

              {/* Category */}
              <form.Field
                name="category"
                children={(field) => (
                  <Field>
                    <FieldTitle>Category</FieldTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between"
                          type="button"
                        >
                          {getMultiSelectDisplay(field.state.value, "category")}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
                        <ScrollArea className="h-[200px]">
                          {CATEGORIES.map((category) => (
                            <DropdownMenuCheckboxItem
                              key={category}
                              checked={field.state.value?.includes(category)}
                              onCheckedChange={(checked) => {
                                const current = field.state.value || [];
                                const updated = checked
                                  ? [...current, category]
                                  : current.filter((c) => c !== category);
                                field.handleChange(updated);
                              }}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {category}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </ScrollArea>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Field>
                )}
              />

              {/* Paid Price Range */}
              <Field>
                <FieldTitle>Paid Price Range</FieldTitle>
                <div className="grid grid-cols-2 gap-2">
                  <form.Field
                    name="paidMin"
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
                    name="paidMax"
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

              {/* Entries */}
              <form.Field
                name="entries"
                children={(field) => (
                  <Field className="gap-2">
                    <FieldTitle>Entries</FieldTitle>
                    <FieldDescription>
                      e.g., Companies, Characters, Artists
                    </FieldDescription>
                    <FieldContent>
                      <div className="flex flex-wrap gap-2">
                        {field.state.value?.map((entry, entryIndex) => (
                          <Badge
                            key={entryIndex}
                            variant="outline"
                            size="lg"
                            className="flex items-center justify-between pr-0"
                          >
                            {entry}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const current = field.state.value || [];
                                field.handleChange(
                                  current.filter((_, idx) => idx !== entryIndex)
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
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between"
                            >
                              Select entries...
                              <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                            <Command>
                              <DebouncedInput
                                value={filters}
                                onChange={(value) =>
                                  setFilters(value.toString())
                                }
                                placeholder="Search entries..."
                                debounce={200}
                                className="rounded-none shadow-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-background"
                              />
                              {entries && entries?.entries.length > 0 && (
                                <CommandList className="space-y-2 p-1">
                                  {isError && (
                                    <CommandEmpty>
                                      Error searching entries: {error.message}
                                    </CommandEmpty>
                                  )}
                                  {entries.entries.length === 0 &&
                                    !isPending &&
                                    !isError && (
                                      <CommandEmpty>
                                        No entries found.
                                      </CommandEmpty>
                                    )}
                                  <CommandGroup className="">
                                    {entries.entries.map((entry) => (
                                      <CommandItem
                                        key={entry.id}
                                        value={entry.id.toString()}
                                        onSelect={() => {
                                          field.handleChange([
                                            ...field.state.value,
                                            entry.id,
                                          ]);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            field.handleChange([
                                              ...field.state.value,
                                              entry.id,
                                            ]);
                                          }
                                        }}
                                      >
                                        <CheckIcon
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.state.value.includes(entry.id)
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        {entry.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              )}
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </FieldContent>
                  </Field>
                )}
              />

              {/* Shop */}
              <form.Field
                name="shop"
                children={(field) => (
                  <Field className="gap-2">
                    <FieldTitle>Shop</FieldTitle>
                    <FieldDescription>e.g., AmiAmi, Mandarake</FieldDescription>
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

              {/* Scale */}
              <form.Field
                name="scale"
                children={(field) => (
                  <Field className="gap-2">
                    <FieldTitle>Scale</FieldTitle>
                    <FieldDescription>
                      e.g., 1/8, 1/7, NON_SCALE
                    </FieldDescription>
                    <FieldContent>
                      <div className="flex flex-wrap gap-2">
                        {field.state.value?.map((scale, scaleIndex) => (
                          <Badge
                            key={scaleIndex}
                            variant="outline"
                            size="lg"
                            className="flex items-center justify-between pr-0"
                          >
                            {scale}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const current = field.state.value || [];
                                field.handleChange(
                                  current.filter((_, idx) => idx !== scaleIndex)
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
                          id="scale-input"
                          type="text"
                          placeholder="Press enter after each scale to add"
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

              {/* Tags */}
              <form.Field
                name="tags"
                children={(field) => (
                  <Field className="gap-2">
                    <FieldTitle>Tags</FieldTitle>
                    <FieldDescription>
                      e.g., favorite, limited-edition
                    </FieldDescription>
                    <FieldContent>
                      <div className="flex flex-wrap gap-2">
                        {field.state.value?.map((tag, tagIndex) => (
                          <Badge
                            key={tagIndex}
                            variant="outline"
                            size="lg"
                            className="flex items-center justify-between pr-0"
                          >
                            {tag}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const current = field.state.value || [];
                                field.handleChange(
                                  current.filter((_, idx) => idx !== tagIndex)
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
                          id="tags-input"
                          type="text"
                          placeholder="Press enter after each tag to add"
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

                {/* Release Date */}
                <Field>
                  <Label>Release Date</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <form.Field
                      name="relDateStart"
                      children={(field) => (
                        <DatePicker
                          placeholder="From"
                          value={field.state.value || null}
                          onChange={(value) => field.handleChange(value || "")}
                        />
                      )}
                    />
                    <form.Field
                      name="relDateEnd"
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

              {/* Release Price Range Filter */}
              <Field>
                <FieldTitle>Release Price Range</FieldTitle>
                <div className="grid grid-cols-2 gap-2">
                  <form.Field
                    name="relPriceMin"
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
                    name="relPriceMax"
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

              {/* Release Currency */}
              <form.Field
                name="relCurrency"
                children={(field) => (
                  <Field>
                    <FieldTitle>Release Price Currency</FieldTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between"
                          type="button"
                        >
                          {getMultiSelectDisplay(field.state.value, "currency")}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
                        <ScrollArea className="h-[200px]">
                          {CURRENCIES.map((currency) => (
                            <DropdownMenuCheckboxItem
                              key={currency}
                              checked={field.state.value?.includes(currency)}
                              onCheckedChange={(checked) => {
                                const current = field.state.value || [];
                                const updated = checked
                                  ? [...current, currency]
                                  : current.filter((c) => c !== currency);
                                field.handleChange(updated);
                              }}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {currency}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </ScrollArea>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Field>
                )}
              />
            </div>
          </ScrollArea>

          <DialogFooter className="">
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([, isSubmitting]) => (
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
