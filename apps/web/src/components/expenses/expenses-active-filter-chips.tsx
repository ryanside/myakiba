import type { CSSProperties, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import type { ExpenseFilters } from "@myakiba/contracts/expenses/schema";
import { Button } from "@/components/ui/button";

type FilterKey = keyof Pick<ExpenseFilters, "dateStart" | "dateEnd" | "status" | "shop">;

type Chip = {
  readonly key: string;
  readonly label: string;
  readonly onClear: () => void;
};

interface ExpensesActiveFilterChipsProps {
  readonly filters: ExpenseFilters;
  readonly onChange: (filters: ExpenseFilters) => void;
  readonly onClearAll: () => void;
}

function clearKey(filters: ExpenseFilters, key: FilterKey): ExpenseFilters {
  return { ...filters, [key]: undefined };
}

function removeFromArray<T>(items: readonly T[], target: T): T[] | undefined {
  const next = items.filter((value) => value !== target);
  return next.length > 0 ? next : undefined;
}

function buildChips(
  filters: ExpenseFilters,
  onChange: (filters: ExpenseFilters) => void,
): readonly Chip[] {
  const chips: Chip[] = [];

  if (filters.dateStart) {
    chips.push({
      key: "dateStart",
      label: `From ${filters.dateStart}`,
      onClear: () => onChange(clearKey(filters, "dateStart")),
    });
  }
  if (filters.dateEnd) {
    chips.push({
      key: "dateEnd",
      label: `To ${filters.dateEnd}`,
      onClear: () => onChange(clearKey(filters, "dateEnd")),
    });
  }
  for (const status of filters.status ?? []) {
    chips.push({
      key: `status:${status}`,
      label: `Status: ${status}`,
      onClear: () =>
        onChange({ ...filters, status: removeFromArray(filters.status ?? [], status) }),
    });
  }
  for (const shop of filters.shop ?? []) {
    chips.push({
      key: `shop:${shop}`,
      label: `Shop: ${shop}`,
      onClear: () => onChange({ ...filters, shop: removeFromArray(filters.shop ?? [], shop) }),
    });
  }

  return chips;
}

export function ExpensesActiveFilterChips({
  filters,
  onChange,
  onClearAll,
}: ExpensesActiveFilterChipsProps): ReactNode {
  const chips = buildChips(filters, onChange);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip, idx) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onClear}
          className="group animate-data-in inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97]"
          style={{ "--data-in-delay": `${idx * 20}ms` } as CSSProperties}
        >
          {chip.label}
          <HugeiconsIcon
            icon={Cancel01Icon}
            className="size-3 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden
          />
          <span className="sr-only">Clear {chip.label}</span>
        </button>
      ))}
      {chips.length > 1 && (
        <Button type="button" variant="ghost" size="sm" onClick={onClearAll}>
          Clear all
        </Button>
      )}
    </div>
  );
}
