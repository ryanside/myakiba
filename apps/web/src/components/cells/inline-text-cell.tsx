import { useCallback, useState } from "react";
import * as Editable from "@/components/ui/editable";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePendingValue } from "@/hooks/use-pending-value";

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
  const [editingValue, setEditingValue] = useState("");
  const [displayValue, submit] = usePendingValue(value, onSubmit);

  const handleEdit = useCallback(() => {
    setEditingValue(displayValue);
    setIsEditing(true);
  }, [displayValue]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSubmit = useCallback(
    async (typed: string): Promise<void> => {
      setIsEditing(false);
      if (typed === value) return;
      if (validate) {
        const validationResult = validate(typed);
        if (validationResult !== true) {
          toast.error(validationResult as string);
          return;
        }
      }
      await submit(typed);
    },
    [submit, validate, value],
  );

  return (
    <Editable.Root
      value={isEditing ? editingValue : displayValue}
      onValueChange={setEditingValue}
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
          e.stopPropagation();
        }}
      >
        <Editable.Preview
          className={cn("w-full min-h-7 hover:bg-muted cursor-text", previewClassName)}
        />
        <Editable.Input
          className={cn("w-full", inputClassName)}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      </Editable.Area>
    </Editable.Root>
  );
}
