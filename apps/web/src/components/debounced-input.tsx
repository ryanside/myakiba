import { type InputHTMLAttributes, useEffect, useState } from "react";
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
  const [value, setValue] = useState<string | number>(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (value === "" || value === 0) {
      onChange(value);
      return;
    }

    const timeout = setTimeout(() => {
      onChange(value);
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value]);

  if (isCommandInput) {
    return (
      <CommandInput
        {...props}
        value={(value as string) ?? ""}
        onValueChange={(value) => {
          setValue(value);
        }}
      />
    );
  }

  return (
    <Input
      {...props}
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "") return setValue("");
        if (props.type === "number") {
          setValue(e.target.valueAsNumber);
        } else {
          setValue(e.target.value);
        }
      }}
    />
  );
}
