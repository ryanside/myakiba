import { useId, useState } from "react";
import { ArrowUpDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCY_LABELS } from "@/lib/locale";
import { CURRENCIES } from "@myakiba/contracts/shared/constants";
import type { Currency } from "@myakiba/contracts/shared/types";

type CurrencySelectProps = {
  readonly id: string;
  readonly value: Currency;
  readonly onValueChange: (value: Currency) => void;
  readonly onBlur?: () => void;
  readonly invalid?: boolean;
};

export function CurrencySelect({
  id,
  value,
  onValueChange,
  onBlur,
  invalid = false,
}: CurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            aria-controls={listId}
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            onBlur={onBlur}
            className="justify-between"
          >
            <span className="min-w-0 truncate text-left">
              <span className="font-medium">{value}</span>
              <span className="text-muted-foreground">{` — ${CURRENCY_LABELS[value]}`}</span>
            </span>
            <HugeiconsIcon
              icon={ArrowUpDownIcon}
              className="size-4 shrink-0 text-muted-foreground"
            />
          </Button>
        }
      />
      <PopoverContent
        align="start"
        aria-label="Currency selection"
        className="w-(--anchor-width) p-0"
      >
        <Command defaultValue={`${value} ${CURRENCY_LABELS[value]}`} label="Currencies">
          <CommandInput placeholder="Search currencies..." />
          <CommandList id={listId}>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {CURRENCIES.map((currency) => (
                <CommandItem
                  key={currency}
                  value={`${currency} ${CURRENCY_LABELS[currency]}`}
                  data-checked={currency === value}
                  onSelect={() => {
                    onValueChange(currency);
                    setOpen(false);
                  }}
                >
                  <span className="w-9 shrink-0 font-medium">{currency}</span>
                  <span className="truncate text-muted-foreground">
                    {CURRENCY_LABELS[currency]}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
