import * as React from "react";
import * as Editable from "@/components/ui/editable";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InlineTextCellProps {
  value: string;
  onSubmit: (value: string) => Promise<void> | void;
  validate?: (value: string) => boolean | string;
  previewClassName?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export function InlineTextCell({
  value,
  onSubmit,
  validate,
  previewClassName,
  inputClassName,
  placeholder,
  disabled,
  readOnly,
}: InlineTextCellProps): React.ReactElement {
  const [isEditing, setIsEditing] = React.useState(false);
  const [currentValue, setCurrentValue] = React.useState(value);

  const resetToPreviousValue = React.useCallback(() => {
    setCurrentValue(value);
  }, [value]);

  const handleSubmit = React.useCallback(
    async (newValue: string) => {
      if (value === newValue) {
        setIsEditing(false);
        return;
      }

      if (validate) {
        const validationResult = validate(newValue);
        if (validationResult !== true) {
          toast.error(validationResult as string);
          resetToPreviousValue();
          return;
        }
      }
      setIsEditing(false);
      try {
        await onSubmit(newValue);
      } catch (err) {
        console.error("Failed to submit edit:", err);
      }
    },
    [onSubmit, resetToPreviousValue, validate, value],
  );

  const handleEdit = React.useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancel = React.useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <Editable.Root
      value={currentValue}
      onValueChange={setCurrentValue}
      onSubmit={handleSubmit}
      onEdit={handleEdit}
      onCancel={handleCancel}
      editing={isEditing}
      onEditingChange={setIsEditing}
      triggerMode="click"
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
    >
      <Editable.Area
        className="w-full"
        onClick={(e) => {
          // Stop propagation to prevent row selection/expand
          e.stopPropagation();
        }}
      >
        <Editable.Preview className={cn("w-full cursor-text", previewClassName)} />
        <Editable.Input
          className={cn("w-full", inputClassName)}
          onClick={(e) => {
            // Stop propagation to prevent row selection/expand
            e.stopPropagation();
          }}
        />
      </Editable.Area>
    </Editable.Root>
  );
}
