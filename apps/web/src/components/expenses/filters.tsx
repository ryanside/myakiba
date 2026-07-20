import type { ReactNode } from "react";
import { format, subMonths } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import type { ExpenseFilters } from "@myakiba/contracts/expenses/schema";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const DATE_PRESETS = [
  { label: "3M", months: 3, value: "3m" },
  { label: "6M", months: 6, value: "6m" },
  { label: "12M", months: 12, value: "12m" },
  { label: "24M", months: 24, value: "24m" },
  { label: "All time", months: null, value: "all" },
] as const;

type DatePresetValue = (typeof DATE_PRESETS)[number]["value"];

interface ExpensesFiltersProps {
  readonly filters: ExpenseFilters;
  readonly shopOptions: readonly string[];
  readonly onChange: (filters: ExpenseFilters) => void;
  readonly onClear: () => void;
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

function presetRange(months: number): Pick<ExpenseFilters, "dateStart" | "dateEnd"> {
  const end = new Date();

  return {
    dateStart: format(subMonths(end, months), "yyyy-MM-dd"),
    dateEnd: format(end, "yyyy-MM-dd"),
  };
}

function activeDatePreset(filters: ExpenseFilters): DatePresetValue | null {
  for (const preset of DATE_PRESETS) {
    if (preset.months === null) {
      if (!filters.dateStart && !filters.dateEnd) {
        return preset.value;
      }
      continue;
    }

    const expected = presetRange(preset.months);
    if (filters.dateStart === expected.dateStart && filters.dateEnd === expected.dateEnd) {
      return preset.value;
    }
  }

  return null;
}

export function ExpensesFilters({
  filters,
  shopOptions,
  onChange,
  onClear,
}: ExpensesFiltersProps): ReactNode {
  const selectedPreset = activeDatePreset(filters);

  const handlePresetChange = (values: string[]): void => {
    if (values.length === 0) {
      return;
    }

    const value = values.at(-1);
    const preset = DATE_PRESETS.find((item) => item.value === value);
    if (!preset) {
      return;
    }

    if (preset.months === null) {
      onChange({ ...filters, dateStart: undefined, dateEnd: undefined });
      return;
    }

    onChange({ ...filters, ...presetRange(preset.months) });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Field>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={selectedPreset ? [selectedPreset] : []}
            onValueChange={handlePresetChange}
            aria-label="Date range"
          >
            {DATE_PRESETS.map((preset) => (
              <ToggleGroupItem key={preset.value} value={preset.value}>
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field className="w-40 shrink-0">
          <DatePicker
            value={filters.dateStart ?? ""}
            onChange={(value) => onChange({ ...filters, dateStart: value || undefined })}
            placeholder="Start date"
          />
        </Field>
        <Field className="w-40 shrink-0">
          <DatePicker
            value={filters.dateEnd ?? ""}
            onChange={(value) => onChange({ ...filters, dateEnd: value || undefined })}
            placeholder="End date"
          />
        </Field>
      </div>

      <Field className="w-full sm:w-48">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="w-full justify-between" type="button">
                {multiSelectDisplay(filters.shop, "shops")}
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent className="w-(--anchor-width)">
            <ScrollArea className="max-h-56">
              {shopOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No shops yet</div>
              ) : (
                shopOptions.map((shop) => (
                  <DropdownMenuCheckboxItem
                    key={shop}
                    checked={(filters.shop ?? []).includes(shop)}
                    onCheckedChange={(checked) => {
                      const nextShop = toggleValue(filters.shop, shop, checked);
                      onChange({
                        ...filters,
                        shop: nextShop.length > 0 ? nextShop : undefined,
                      });
                    }}
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
      <Button type="button" variant="ghost" size="icon-sm" onClick={onClear}>
        <HugeiconsIcon icon={Refresh01Icon} className="size-4" />
      </Button>
    </div>
  );
}
