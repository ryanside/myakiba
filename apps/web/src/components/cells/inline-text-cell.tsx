import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { usePendingValue } from "@/hooks/use-pending-value";
import type { Saving } from "@/data/client";

interface InlineTextCellProps {
  label: string;
  value: string;
  onSubmit: (value: string) => Saving;
  validate?: (value: string) => boolean | string;
  previewClassName?: string;
  disabled?: boolean;
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
  const preview = useRef<HTMLButtonElement>(null);
  // Enter and Escape remove the focused input, so focus returns to the preview, without editing.
  const returningFocus = useRef(false);

  useEffect(() => {
    if (!isEditing && returningFocus.current) preview.current?.focus();
  }, [isEditing]);

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
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setEditingValue(event.target.value)}
          onBlur={() => {
            if (!disabled) void handleSubmit(editingValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              returningFocus.current = true;
              handleCancel();
            } else if (event.key === "Enter") {
              // Focus is on the preview by the key's next event, which would click it open again.
              event.preventDefault();
              returningFocus.current = true;
              void handleSubmit(editingValue);
            }
          }}
          className="h-auto rounded-sm px-0 shadow-xs focus-visible:border-input focus-visible:ring-1 focus-visible:ring-ring disabled:bg-transparent dark:bg-transparent dark:disabled:bg-transparent"
        />
      ) : (
        <Button
          ref={preview}
          type="button"
          variant="ghost"
          aria-label={`Edit ${label}`}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            handleEdit();
          }}
          onFocus={() => {
            if (returningFocus.current) returningFocus.current = false;
            else handleEdit();
          }}
          className={cn(
            "h-auto min-h-7 w-full cursor-text justify-start truncate rounded-sm px-0 py-1 text-left text-base font-normal transition-colors focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-auto disabled:opacity-100 md:text-sm dark:hover:bg-muted",
            previewClassName,
          )}
        >
          {displayValue}
        </Button>
      )}
    </div>
  );
}
