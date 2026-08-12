import { useEffect, useRef } from "react";
import type { FocusEvent, InputHTMLAttributes } from "react";
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
  const defaultValueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  const locallyEmittedValuesRef = useRef(new Set<string>());
  const pendingExternalValueRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const inputElement = isCommandInput ? commandInputRef.current : inputRef.current;
    const nextValue = String(initialValue);

    if (!inputElement) return;

    // Incoming values can be stale acknowledgements while the user is still typing.
    if (document.activeElement === inputElement) {
      pendingExternalValueRef.current = locallyEmittedValuesRef.current.has(nextValue)
        ? null
        : nextValue;
      return;
    }

    pendingExternalValueRef.current = null;
    locallyEmittedValuesRef.current.clear();
    if (inputElement.value !== nextValue) {
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
      locallyEmittedValuesRef.current.add(String(value));
      onChangeRef.current(value);
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      locallyEmittedValuesRef.current.add(String(value));
      onChangeRef.current(value);
      timeoutRef.current = null;
    }, debounce);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    const pendingExternalValue = pendingExternalValueRef.current;

    if (pendingExternalValue !== null) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (event.currentTarget.value !== pendingExternalValue) {
        event.currentTarget.value = pendingExternalValue;
      }
    }

    pendingExternalValueRef.current = null;
    locallyEmittedValuesRef.current.clear();
    props.onBlur?.(event);
  };

  if (isCommandInput) {
    return (
      <CommandInput
        {...props}
        ref={commandInputRef}
        defaultValue={String(defaultValueRef.current)}
        onBlur={handleBlur}
        onValueChange={handleValueChange}
      />
    );
  }

  return (
    <Input
      {...props}
      ref={inputRef}
      defaultValue={defaultValueRef.current}
      onBlur={handleBlur}
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
