import * as React from "react";

type InputValue = string[] | string;

interface VisuallyHiddenInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "checked" | "onReset"
> {
  value?: InputValue;
  checked?: boolean;
  bubbles?: boolean;
}

function VisuallyHiddenInput(props: VisuallyHiddenInputProps) {
  const { value, checked, bubbles = true, type = "hidden", style, ...inputProps } = props;

  const isCheckInput = React.useMemo(
    () => type === "checkbox" || type === "radio" || type === "switch",
    [type],
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  const currentValue = isCheckInput ? checked : value;
  const previousValueRef = React.useRef<InputValue | boolean | undefined>(currentValue);

  React.useEffect(() => {
    const previousValue = previousValueRef.current;
    previousValueRef.current = currentValue;
    const input = inputRef.current;
    if (!input) return;

    const inputProto = window.HTMLInputElement.prototype;
    const propertyKey = isCheckInput ? "checked" : "value";
    const eventType = isCheckInput ? "click" : "input";
    const getSerializedCurrentValue = () => {
      if (isCheckInput) return checked;
      if (Array.isArray(value)) return JSON.stringify(value);
      return value;
    };
    const serializedCurrentValue = getSerializedCurrentValue();

    const descriptor = Object.getOwnPropertyDescriptor(inputProto, propertyKey);

    const setter = descriptor?.set;

    if (previousValue !== currentValue && setter) {
      const event = new Event(eventType, { bubbles });
      setter.call(input, serializedCurrentValue);
      input.dispatchEvent(event);
    }
  }, [currentValue, value, checked, bubbles, isCheckInput]);

  const composedStyle = React.useMemo<React.CSSProperties>(() => {
    return {
      ...style,
      border: 0,
      clip: "rect(0 0 0 0)",
      clipPath: "inset(50%)",
      height: "1px",
      margin: "-1px",
      overflow: "hidden",
      padding: 0,
      position: "absolute",
      whiteSpace: "nowrap",
      width: "1px",
    };
  }, [style]);

  return (
    <input
      type={type}
      {...inputProps}
      ref={inputRef}
      aria-hidden={isCheckInput}
      tabIndex={-1}
      defaultChecked={isCheckInput ? checked : undefined}
      style={composedStyle}
    />
  );
}

export { VisuallyHiddenInput };
