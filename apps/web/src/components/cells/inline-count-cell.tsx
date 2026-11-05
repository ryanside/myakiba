import { useCallback, useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { usePendingValue } from "@/hooks/use-pending-value";
import { cn } from "@/lib/utils";
import { CELL_EDITOR_CLASS_NAME, CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";

interface InlineCountCellProps {
  /** What the cell holds, such as "Count", for its accessible name. */
  label: string;
  value: number;
  onSubmit: (newValue: number) => Promise<void>;
  disabled?: boolean;
}

export function InlineCountCell({
  label,
  value,
  onSubmit,
  disabled = false,
}: InlineCountCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState(1);
  const [displayValue, submit] = usePendingValue(value, onSubmit);

  const handleEdit = useCallback(() => {
    setEditingValue(displayValue);
    setIsEditing(true);
  }, [displayValue]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsEditing(false);
    if (editingValue === displayValue) return;
    await submit(editingValue);
  }, [displayValue, editingValue, submit]);

  if (isEditing) {
    return (
      <div className="grid">
        <Input
          id="count"
          name="count"
          aria-label={label}
          autoFocus
          className={CELL_EDITOR_CLASS_NAME}
          value={editingValue}
          // Leaving the cell keeps what was typed, as the Shop cell does.
          onBlur={() => {
            if (!disabled) void handleSubmit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            } else if (e.key === "Escape") {
              handleCancel();
            }
          }}
          type="number"
          min="1"
          onChange={(e) => setEditingValue(Number.parseInt(e.target.value, 10) || 1)}
          placeholder="1"
        />
      </div>
    );
  }

  return (
    <Button
      onClick={handleEdit}
      className={cn(CELL_TRIGGER_CLASS_NAME, "h-8 justify-start text-foreground")}
      variant="ghost"
      disabled={disabled}
      aria-label={`${displayValue}, edit ${label}`}
    >
      {displayValue}
    </Button>
  );
}
