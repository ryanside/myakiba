import { Autocomplete } from "@base-ui/react/autocomplete";
import { useState } from "react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

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
  const shown = open && suggestions.some((suggestion) => suggestion !== value);

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
          // An IME's Enter confirms composed text, so neither the popup nor the field may act on it.
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            event.preventBaseUIHandler();
            return;
          }
          // The popup owns Escape, and Enter on a highlighted suggestion, so the field never sees them.
          const ownedByPopup =
            shown &&
            (event.key === "Escape" || (event.key === "Enter" && highlighted !== undefined));
          if (!ownedByPopup) onKeyDown?.(event);
        }}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Autocomplete.Popup className="max-h-(--available-height) w-(--anchor-width) min-w-36 popup-motion overflow-x-hidden overflow-y-auto overscroll-contain rounded-(--radius-outer) bg-popover p-(--inset) [--inset:--spacing(1)] [--radius-outer:var(--radius-lg)] text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden">
            <Autocomplete.List>
              {(suggestion: string) => (
                <Autocomplete.Item
                  key={suggestion}
                  value={suggestion}
                  className="flex cursor-default items-center rounded-inner py-1 px-1.5 text-sm outline-hidden select-none data-highlighted:bg-foreground/10"
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
