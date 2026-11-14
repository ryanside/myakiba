import { Autocomplete } from "@base-ui/react/autocomplete";
import { useState } from "react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/** What a free-text field suggests while the user types, and the spelling it saves. */
export type Suggester = {
  readonly suggestions: (query: string) => readonly string[];
  readonly canonical: (typed: string) => string;
};

type SuggestInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  suggestions: readonly string[];
  onPick?: (value: string) => void;
};

/**
 * A free-text input that offers suggestions. Enter picks the highlighted suggestion. With none
 * highlighted, Enter reaches the input's own handler and its form.
 */
export function SuggestInput({
  value,
  onValueChange,
  suggestions,
  onPick,
  className,
  onKeyDown,
  ...inputProps
}: SuggestInputProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string>();
  const shown = open && suggestions.length > 0;

  return (
    <Autocomplete.Root
      items={suggestions}
      filter={null}
      value={value}
      onValueChange={(next, details) => {
        // Escape in a closed popup clears the input, which would erase the saved value.
        if (details.reason === "escape-key") return;
        onValueChange(next);
        if (details.reason === "item-press") onPick?.(next);
      }}
      open={shown}
      onOpenChange={setOpen}
      onItemHighlighted={setHighlighted}
      openOnInputClick
    >
      <Autocomplete.Input
        render={<Input className={className} />}
        {...inputProps}
        onKeyDown={(event) => {
          // The popup owns Escape, and Enter on a highlighted suggestion, so the field never sees them.
          const ownedByPopup =
            shown &&
            (event.key === "Escape" || (event.key === "Enter" && highlighted !== undefined));
          if (!ownedByPopup) onKeyDown?.(event);
        }}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Autocomplete.Popup className="max-h-(--available-height) w-(--anchor-width) min-w-40 popup-motion overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden">
            <Autocomplete.List>
              {(suggestion: string) => (
                <Autocomplete.Item
                  key={suggestion}
                  value={suggestion}
                  className="flex cursor-default items-center rounded-inner px-2 py-1.5 outline-hidden select-none data-highlighted:bg-muted data-highlighted:inset-ring-1 data-highlighted:inset-ring-ring"
                >
                  <span className="min-w-0 truncate">{suggestion}</span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
