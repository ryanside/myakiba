import { useCallback, useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { usePendingValue } from "@/hooks/use-pending-value";

interface InlineCountCellProps {
  value: number;
  onSubmit: (newValue: number) => Promise<void>;
  disabled?: boolean;
}

export function InlineCountCell({ value, onSubmit, disabled = false }: InlineCountCellProps) {
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
    await submit(editingValue);
  }, [editingValue, submit]);

  if (isEditing) {
    return (
      <div className="grid gap-2">
        <Input
          id="count"
          name="count"
          className="w-full text-foreground pl-0"
          value={editingValue}
          onBlur={handleCancel}
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
      className="w-full justify-start text-foreground pl-0"
      variant="ghost"
      disabled={disabled}
    >
      {displayValue}
    </Button>
  );
}
