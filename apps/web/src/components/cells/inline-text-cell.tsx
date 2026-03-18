import { useState, useCallback } from "react";
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
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  const resetToPreviousValue = useCallback(() => {
    setCurrentValue(value);
  }, [value]);

  const handleSubmit = useCallback(
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

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancel = useCallback(() => {
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
      triggerMode="focus"
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
        <Editable.Preview
          className={cn("w-full min-h-7 hover:bg-muted cursor-text", previewClassName)}
        />
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
