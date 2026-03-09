import { useEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { Input } from "./ui/input";
import { CommandInput } from "./ui/command";

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 200,
  isCommandInput = false,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
  isCommandInput?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const inputElement = isCommandInput ? commandInputRef.current : inputRef.current;
    const nextValue = String(initialValue);

    if (inputElement && inputElement.value !== nextValue) {
      inputElement.value = nextValue;
    }
  }, [initialValue, isCommandInput]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleValueChange = (value: string | number): void => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (value === "" || value === 0) {
      onChange(value);
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      onChange(value);
      timeoutRef.current = null;
    }, debounce);
  };

  if (isCommandInput) {
    return (
      <CommandInput
        {...props}
        ref={commandInputRef}
        defaultValue={String(initialValue)}
        onValueChange={handleValueChange}
      />
    );
  }

  return (
    <Input
      {...props}
      ref={inputRef}
      defaultValue={initialValue}
      onChange={(e) => {
        if (e.target.value === "") {
          handleValueChange("");
          return;
        }

        if (props.type === "number") {
          handleValueChange(e.target.valueAsNumber);
        } else {
          handleValueChange(e.target.value);
        }
      }}
    />
  );
}
