import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUpDownIcon,
  Cancel01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
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
import { useId, useState, type ReactElement } from "react";
import { Field, FieldContent, FieldDescription, FieldTitle } from "@/components/ui/field";
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
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchEntries } from "@/queries/search";
import { DebouncedInput } from "@/components/debounced-input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { majorStringToMinorUnits, minorUnitsToMajorString } from "@myakiba/utils/currency";
import {
  SHIPPING_METHODS,
  CONDITIONS,
  CURRENCIES,
  CATEGORIES,
} from "@myakiba/contracts/shared/constants";
import type { Currency } from "@myakiba/contracts/shared/types";
import { getCurrencyLocale } from "@/lib/locale";

interface FiltersFormProps {
  renderTrigger: ReactElement;
  currentFilters?: CollectionFilters;
  onApplyFilters: (filters: CollectionFilters) => void;
  currency: Currency;
}

const ENTRY_SEARCH_PAGE_SIZE = 20;

export default function FiltersForm({
  renderTrigger,
  currentFilters,
  onApplyFilters,
  currency,
}: FiltersFormProps) {
  const entriesListId = useId();
  const [entriesPopoverOpen, setEntriesPopoverOpen] = useState(false);
  const userLocale = getCurrencyLocale(currency);

  const form = useForm({
    defaultValues: {
      paidMin:
        currentFilters?.paidMin !== undefined
          ? minorUnitsToMajorString(currentFilters.paidMin)
          : "",
      paidMax:
        currentFilters?.paidMax !== undefined
          ? minorUnitsToMajorString(currentFilters.paidMax)
          : "",
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
      relPriceMin:
        currentFilters?.relPriceMin !== undefined
          ? minorUnitsToMajorString(currentFilters.relPriceMin)
          : "",
      relPriceMax:
        currentFilters?.relPriceMax !== undefined
          ? minorUnitsToMajorString(currentFilters.relPriceMax)
          : "",
      relCurrency: currentFilters?.relCurrency ?? [],
      category: currentFilters?.category ?? [],
      entries: currentFilters?.entries ?? [],
      scale: currentFilters?.scale ?? [],
      tags: currentFilters?.tags ?? [],
      condition: currentFilters?.condition ?? [],
    },
    onSubmit: async ({ value }) => {
      const toMinorUnits = (amount: string): number | undefined =>
        amount.trim() === "" ? undefined : majorStringToMinorUnits(amount);
      const filters: CollectionFilters = {
        paidMin: toMinorUnits(value.paidMin),
        paidMax: toMinorUnits(value.paidMax),
        shop: value.shop && value.shop.length > 0 ? value.shop : undefined,
        payDateStart: value.payDateStart || undefined,
        payDateEnd: value.payDateEnd || undefined,
        shipDateStart: value.shipDateStart || undefined,
        shipDateEnd: value.shipDateEnd || undefined,
        colDateStart: value.colDateStart || undefined,
        colDateEnd: value.colDateEnd || undefined,
        shipMethod: value.shipMethod && value.shipMethod.length > 0 ? value.shipMethod : undefined,
        relDateStart: value.relDateStart || undefined,
        relDateEnd: value.relDateEnd || undefined,
        relPriceMin: toMinorUnits(value.relPriceMin),
        relPriceMax: toMinorUnits(value.relPriceMax),
        relCurrency:
          value.relCurrency && value.relCurrency.length > 0 ? value.relCurrency : undefined,
        category: value.category && value.category.length > 0 ? value.category : undefined,
        entries: value.entries && value.entries.length > 0 ? value.entries : undefined,
        scale: value.scale && value.scale.length > 0 ? value.scale : undefined,
        tags: value.tags && value.tags.length > 0 ? value.tags : undefined,
        condition: value.condition && value.condition.length > 0 ? value.condition : undefined,
      };

      onApplyFilters(filters);
    },
  });

  const getMultiSelectDisplay = (items: string[] | undefined, label: string): string => {
    if (!items || items.length === 0) return `Select ${label}`;
    if (items.length === 1) return items[0];
    return `${items.length} selected`;
  };

  const [entrySearch, setEntrySearch] = useState("");
  const [entryNameMap, setEntryNameMap] = useState<Record<string, string>>({});

  const {
    data: entryPages,
    isPending: isEntriesPending,
    isFetchingNextPage: isFetchingMoreEntries,
    hasNextPage: hasMoreEntries,
    fetchNextPage: fetchMoreEntries,
    error: entriesError,
    isError: isEntriesError,
  } = useInfiniteQuery({
    queryKey: ["entries", entrySearch],
    queryFn: ({ pageParam }) =>
      searchEntries({
        search: entrySearch,
        limit: ENTRY_SEARCH_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.entries.length < ENTRY_SEARCH_PAGE_SIZE
        ? undefined
        : lastPageParam + ENTRY_SEARCH_PAGE_SIZE,
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: entrySearch.length > 0,
  });

  const entries = entryPages?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <Dialog>
      <DialogTrigger render={renderTrigger} />
      <DialogContent className="sm:max-w-lg! px-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <DialogHeader className="pb-4 px-4">
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>Apply filters to narrow down your collection</DialogDescription>
          </DialogHeader>

          <ScrollArea className="overflow-auto max-h-[60vh] pb-4 w-full">
            <div className="grid gap-4 px-4">
              {/* Shipping Method */}
              <form.Field
                name="shipMethod"
                children={(field) => (
                  <Field>
                    <FieldTitle>Shipping Method</FieldTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            type="button"
                          >
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

              {/* Condition */}
              <form.Field
                name="condition"
                children={(field) => (
                  <Field>
                    <FieldTitle>Condition</FieldTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            type="button"
                          >
                            {getMultiSelectDisplay(field.state.value, "condition")}
                            <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent className="w-(--anchor-width)">
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
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            type="button"
                          >
                            {getMultiSelectDisplay(field.state.value, "category")}
                            <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent className="w-(--anchor-width)">
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
                        currency={currency}
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
                        currency={currency}
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
                    <FieldDescription>e.g., Companies, Characters, Artists</FieldDescription>
                    <FieldContent>
                      <div className="flex flex-wrap gap-1.5">
                        {field.state.value?.map((entryId) => (
                          <Badge
                            key={entryId}
                            variant="outline"
                            className="flex items-center gap-0.5 pr-0"
                          >
                            {entryNameMap[entryId] ?? entryId}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                field.handleChange(
                                  (field.state.value || []).filter((id) => id !== entryId),
                                );
                              }}
                              className="hover:text-red-500 hover:bg-transparent!"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Popover open={entriesPopoverOpen} onOpenChange={setEntriesPopoverOpen}>
                          <PopoverTrigger
                            render={
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-controls={entriesListId}
                                aria-expanded={entriesPopoverOpen}
                                aria-haspopup="listbox"
                                className="w-full justify-between"
                              >
                                Select entries...
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
                                value={entrySearch}
                                onChange={(value) => setEntrySearch(value.toString())}
                                placeholder="Search entries..."
                                debounce={200}
                                isCommandInput
                              />
                              <CommandList id={entriesListId}>
                                {entrySearch.length === 0 && (
                                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    Type to search for entries
                                  </div>
                                )}
                                {entrySearch.length > 0 && isEntriesError && (
                                  <CommandEmpty>
                                    Could not load entries. {entriesError.message}
                                  </CommandEmpty>
                                )}
                                {entrySearch.length > 0 && isEntriesPending && !isEntriesError && (
                                  <div className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                                    <HugeiconsIcon
                                      icon={Loading03Icon}
                                      className="h-4 w-4 animate-spin"
                                    />
                                    Searching...
                                  </div>
                                )}
                                {entrySearch.length > 0 &&
                                  entries.length === 0 &&
                                  !isEntriesPending &&
                                  !isEntriesError && <CommandEmpty>No entries found.</CommandEmpty>}
                                {entries.length > 0 && (
                                  <>
                                    <CommandGroup>
                                      {entries.map((entry) => {
                                        const isSelected = field.state.value.includes(entry.id);
                                        return (
                                          <CommandItem
                                            key={entry.id}
                                            value={entry.id}
                                            data-checked={isSelected}
                                            onSelect={() => {
                                              const current = field.state.value ?? [];
                                              if (isSelected) {
                                                field.handleChange(
                                                  current.filter((id) => id !== entry.id),
                                                );
                                              } else {
                                                field.handleChange([...current, entry.id]);
                                                setEntryNameMap((prev) => ({
                                                  ...prev,
                                                  [entry.id]: entry.name,
                                                }));
                                              }
                                            }}
                                          >
                                            <span className="flex flex-col">
                                              <span>{entry.name}</span>
                                              {entry.category && (
                                                <span className="text-xs text-muted-foreground">
                                                  {entry.category}
                                                </span>
                                              )}
                                            </span>
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                    {hasMoreEntries && (
                                      <div className="px-2 pb-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-center text-xs"
                                          onClick={() => void fetchMoreEntries()}
                                          disabled={isFetchingMoreEntries}
                                        >
                                          {isFetchingMoreEntries ? (
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

              {/* Scale */}
              <form.Field
                name="scale"
                children={(field) => (
                  <Field className="gap-2">
                    <FieldTitle>Scale</FieldTitle>
                    <FieldDescription>e.g., 1/8, 1/7, NON_SCALE</FieldDescription>
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
                                field.handleChange(current.filter((_, idx) => idx !== scaleIndex));
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
                    <FieldDescription>e.g., favorite, limited-edition</FieldDescription>
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
                                field.handleChange(current.filter((_, idx) => idx !== tagIndex));
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
                        currency={currency}
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
                        currency={currency}
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
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            type="button"
                          >
                            {getMultiSelectDisplay(field.state.value, "currency")}
                            <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent className="w-(--anchor-width)">
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
