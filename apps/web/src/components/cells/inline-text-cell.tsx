import { useState } from "react";
import type { FocusEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { usePendingValue } from "@/hooks/use-pending-value";
import { CELL_EDITOR_CLASS_NAME, CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";
import { EmptyValue } from "./empty-value";

interface InlineTextCellProps {
  label: string;
  value: string;
  onSubmit: (value: string) => Promise<void> | void;
  validate?: (value: string) => boolean | string;
  previewClassName?: string;
  disabled?: boolean;
}

// Select everything, with the caret at the start, so a long value opens on its first words
// instead of scrolled to its end.
function selectFromStart(event: FocusEvent<HTMLInputElement>): void {
  const field = event.currentTarget;
  field.setSelectionRange(0, field.value.length, "backward");
  field.scrollLeft = 0;
}

export function InlineTextCell({
  label,
  value,
  onSubmit,
  validate,
  previewClassName,
  disabled,
}: InlineTextCellProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");
  const [displayValue, submit] = usePendingValue(value, onSubmit);

  const handleEdit = () => {
    setEditingValue(displayValue);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSubmit = async (typed: string): Promise<void> => {
    setIsEditing(false);
    if (typed === value) return;
    if (validate) {
      const validationResult = validate(typed);
      if (validationResult !== true) {
        toast.add({ type: "error", title: validationResult as string });
        return;
      }
    }
    await submit(typed);
  };

  return (
    <div
      className={cn(
        "relative inline-block w-full min-w-0",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {isEditing ? (
        <Input
          autoFocus
          aria-label={label}
          value={editingValue}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onFocus={selectFromStart}
          onChange={(event) => setEditingValue(event.target.value)}
          onBlur={() => {
            if (!disabled) void handleSubmit(editingValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              handleCancel();
            } else if (event.key === "Enter") {
              void handleSubmit(editingValue);
            }
          }}
          className={CELL_EDITOR_CLASS_NAME}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          aria-label={`${displayValue || "Empty"}, edit ${label}`}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onFocus={handleEdit}
          className={cn(
            CELL_TRIGGER_CLASS_NAME,
            "h-8 cursor-text justify-start truncate text-left text-base font-normal transition-colors focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-auto disabled:opacity-100 md:text-sm dark:hover:bg-muted",
            previewClassName,
          )}
        >
          {displayValue ? <span className="truncate">{displayValue}</span> : <EmptyValue />}
        </Button>
      )}
    </div>
  );
}
