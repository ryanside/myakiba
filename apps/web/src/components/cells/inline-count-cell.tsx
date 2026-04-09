import { Input } from "../ui/input";
import { useCallback, useState } from "react";
import { Button } from "../ui/button";
import { tryCatch } from "@myakiba/utils/result";

interface InlineCountCellProps {
  value: number;
  onSubmit: (newValue: number) => Promise<void>;
  disabled?: boolean;
}

export function InlineCountCell({ value, onSubmit, disabled = false }: InlineCountCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newValue, setNewValue] = useState(value);

  const handleSubmit = useCallback(async () => {
    if (newValue === value) {
      setIsEditing(false);
      return;
    }
    const { error } = await tryCatch(onSubmit(newValue));
    if (error) {
      setNewValue(value);
    }
    setIsEditing(false);
  }, [newValue, value, onSubmit]);

  const handleCancel = () => {
    setNewValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="grid gap-2">
        <Input
          id="count"
          name="count"
          className="w-full text-foreground pl-0"
          value={newValue}
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
          onChange={(e) => setNewValue(parseInt(e.target.value) || 1)}
          placeholder="1"
          autoFocus
        />
      </div>
    );
  }

  return (
    <Button
      onClick={() => setIsEditing(true)}
      className="w-full justify-start text-foreground pl-0"
      variant="ghost"
      disabled={disabled}
    >
      {newValue}
    </Button>
  );
}
