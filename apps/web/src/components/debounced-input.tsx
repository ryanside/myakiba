import { useEffect, useRef, useState } from "react";
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
  // eslint-disable-next-line react/hook-use-state -- Capture the initial value for uncontrolled input defaults.
  const [defaultValue] = useState(initialValue);
  const onChangeRef = useRef(onChange);
  const pendingLocalAcknowledgementsRef = useRef(new Set<string>());
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
      if (pendingLocalAcknowledgementsRef.current.delete(nextValue)) {
        return;
      }

      pendingExternalValueRef.current = nextValue;
      return;
    }

    pendingExternalValueRef.current = null;
    pendingLocalAcknowledgementsRef.current.clear();
    if (timeoutRef.current !== null) return;
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

  const reportAndDropExternalValue = (value: string | number): void => {
    pendingExternalValueRef.current = null;
    pendingLocalAcknowledgementsRef.current.add(String(value));
    onChangeRef.current(value);
  };

  const handleValueChange = (value: string | number): void => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (value === "" || value === 0) {
      reportAndDropExternalValue(value);
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      reportAndDropExternalValue(value);
    }, debounce);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    const pendingExternalValue = pendingExternalValueRef.current;
    const isEditPending = timeoutRef.current !== null;

    if (
      pendingExternalValue !== null &&
      !isEditPending &&
      event.currentTarget.value !== pendingExternalValue
    ) {
      event.currentTarget.value = pendingExternalValue;
    }

    pendingExternalValueRef.current = null;
    pendingLocalAcknowledgementsRef.current.clear();
    props.onBlur?.(event);
  };

  if (isCommandInput) {
    return (
      <CommandInput
        {...props}
        ref={commandInputRef}
        defaultValue={String(defaultValue)}
        onBlur={handleBlur}
        onValueChange={handleValueChange}
      />
    );
  }

  return (
    <Input
      {...props}
      ref={inputRef}
      defaultValue={defaultValue}
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
