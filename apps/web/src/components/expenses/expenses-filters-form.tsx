import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, FilterIcon } from "@hugeicons/core-free-icons";
import { ORDER_STATUSES } from "@myakiba/contracts/shared/constants";
import type { ExpenseFilters } from "@myakiba/contracts/expenses/schema";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldTitle } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ExpensesFiltersFormProps {
  readonly currentFilters: ExpenseFilters;
  readonly shopOptions: readonly string[];
  readonly activeFilterCount: number;
  readonly showShopFilter?: boolean;
  readonly onApplyFilters: (filters: ExpenseFilters) => void;
  readonly onClearFilters: () => void;
}

function multiSelectDisplay(items: readonly string[] | undefined, label: string): string {
  if (!items || items.length === 0) return `Select ${label}`;
  if (items.length === 1) return items[0] ?? `Select ${label}`;
  return `${items.length} selected`;
}

function toggleValue<T extends string>(
  items: readonly T[] | undefined,
  item: T,
  checked: boolean,
): T[] {
  const current = items ?? [];
  return checked ? [...current, item] : current.filter((value) => value !== item);
}

export function ExpensesFiltersForm({
  currentFilters,
  shopOptions,
  activeFilterCount,
  showShopFilter = true,
  onApplyFilters,
  onClearFilters,
}: ExpensesFiltersFormProps): React.ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const form = useForm({
    defaultValues: {
      dateStart: currentFilters.dateStart ?? "",
      dateEnd: currentFilters.dateEnd ?? "",
      status: currentFilters.status ?? [],
      shop: currentFilters.shop ?? [],
    },
    onSubmit: async ({ value }) => {
      onApplyFilters({
        dateStart: value.dateStart || undefined,
        dateEnd: value.dateEnd || undefined,
        status: value.status.length > 0 ? value.status : undefined,
        shop: showShopFilter && value.shop.length > 0 ? value.shop : undefined,
      });
    },
  });

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    form.handleSubmit();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <HugeiconsIcon icon={FilterIcon} strokeWidth={2} />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Filter expenses</DialogTitle>
          <DialogDescription>
            Narrow expense analytics by date, status{showShopFilter ? ", or shop" : ""}.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <form.Field
              name="dateStart"
              children={(field) => (
                <Field>
                  <FieldTitle>Start date</FieldTitle>
                  <DatePicker
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value ?? "")}
                    onBlur={field.handleBlur}
                    placeholder="Start date"
                  />
                </Field>
              )}
            />
            <form.Field
              name="dateEnd"
              children={(field) => (
                <Field>
                  <FieldTitle>End date</FieldTitle>
                  <DatePicker
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value ?? "")}
                    onBlur={field.handleBlur}
                    placeholder="End date"
                  />
                </Field>
              )}
            />
          </div>

          <form.Field
            name="status"
            children={(field) => (
              <Field>
                <FieldTitle>Status</FieldTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="outline" className="w-full justify-between" type="button">
                        {multiSelectDisplay(field.state.value, "status")}
                        <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent className="w-(--anchor-width)">
                    {ORDER_STATUSES.map((status) => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={field.state.value.includes(status)}
                        onCheckedChange={(checked) =>
                          field.handleChange(toggleValue(field.state.value, status, checked))
                        }
                        onSelect={(event) => event.preventDefault()}
                      >
                        {status}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Field>
            )}
          />

          {showShopFilter && (
            <form.Field
              name="shop"
              children={(field) => (
                <Field>
                  <FieldTitle>Shop</FieldTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="outline" className="w-full justify-between" type="button">
                          {multiSelectDisplay(field.state.value, "shops")}
                          <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent className="w-(--anchor-width)">
                      <ScrollArea className="max-h-56">
                        {shopOptions.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No shops yet
                          </div>
                        ) : (
                          shopOptions.map((shop) => (
                            <DropdownMenuCheckboxItem
                              key={shop}
                              checked={field.state.value.includes(shop)}
                              onCheckedChange={(checked) =>
                                field.handleChange(toggleValue(field.state.value, shop, checked))
                              }
                              onSelect={(event) => event.preventDefault()}
                            >
                              {shop}
                            </DropdownMenuCheckboxItem>
                          ))
                        )}
                      </ScrollArea>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Field>
              )}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear
            </Button>
            <Button type="submit" onClick={() => setIsOpen(false)}>
              Apply filters
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
