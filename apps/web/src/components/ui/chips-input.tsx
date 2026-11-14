import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { SuggestInput } from "@/components/ui/suggest-input";

type ChipsInputProps = Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "maxLength"
> & {
  values: readonly string[];
  onValuesChange: (values: string[]) => void;
  suggest: (query: string) => readonly string[];
  /** Names one value in each chip's remove button, as in "Remove tag Favorite". */
  noun: string;
  maxValues: number;
  maxLength: number;
};

/**
 * Chips for a list of values, with a field that suggests more. Enter adds the typed value as
 * typed, picking a suggestion adds the suggestion, and Backspace in an empty field removes the last.
 */
export function ChipsInput({
  values,
  onValuesChange,
  suggest,
  noun,
  maxValues,
  maxLength,
  disabled,
  ...inputProps
}: ChipsInputProps): React.ReactElement {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const suggestions = suggest(text).filter(
    (suggestion) => suggestion.length <= maxLength && !values.includes(suggestion),
  );

  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "" && !values.includes(trimmed) && values.length < maxValues) {
      onValuesChange([...values, trimmed]);
    }
    setText("");
  };

  return (
    <div className="grid gap-2">
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li key={value}>
              <Badge variant="outline" className="h-6 gap-0.5 pr-0.5 pl-1.5">
                <span className="[overflow-wrap:anywhere] whitespace-normal">{value}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${noun} ${value}`}
                  disabled={disabled}
                  onClick={() => {
                    onValuesChange(values.filter((other) => other !== value));
                    // The button is gone next render, and the input may only then be enabled.
                    requestAnimationFrame(() => input.current?.focus());
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <SuggestInput
        {...inputProps}
        ref={input}
        value={text}
        onValueChange={setText}
        onPick={add}
        suggestions={suggestions}
        maxLength={maxLength}
        disabled={disabled || values.length >= maxValues}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(text);
          } else if (event.key === "Backspace" && text === "" && values.length > 0) {
            onValuesChange(values.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
