import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  /** Sits right after the value, and stays in view when the value truncates. */
  previewIcon?: ReactNode;
  /** The preview and the input are as wide as their text, up to the row's width, not always that wide. */
  fitContent?: boolean;
  disabled?: boolean;
}

// A box that hugs its text needs room inside. Its text stays put, as the room goes out to the start.
const FIT = "-ms-1.5 max-w-[calc(100%+0.375rem)] px-1.5";
const FIT_PREVIEW = `${FIT} w-fit`;
const FIT_INPUT = `${FIT} field-sizing-content w-auto min-w-40`;

export function InlineTextCell({
  label,
  value,
  onSubmit,
  validate,
  previewClassName,
  previewIcon,
  fitContent,
  disabled,
}: InlineTextCellProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");
  const [displayValue, submit] = usePendingValue(value, onSubmit);
  const preview = useRef<HTMLButtonElement>(null);
  // Enter and Escape remove the focused input, so focus returns to the preview, without editing.
  const returningFocus = useRef(false);

  // A save can disable the preview for a moment, so this waits. By then focus may have moved on.
  useEffect(() => {
    if (isEditing || disabled || !returningFocus.current) return;
    if (document.activeElement === document.body) preview.current?.focus();
    else returningFocus.current = false;
  }, [isEditing, disabled]);

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
          // Holds the width where `field-sizing` is not supported, and is ignored where it is.
          size={fitContent ? Math.max(editingValue.length + 1, 20) : undefined}
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
          className={cn(
            "rounded-sm px-0 shadow-xs focus-visible:border-input focus-visible:ring-1 focus-visible:ring-ring disabled:bg-transparent dark:bg-transparent dark:disabled:bg-transparent",
            fitContent && FIT_INPUT,
          )}
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
            "w-full cursor-text justify-start truncate rounded-sm px-0 text-left text-base font-normal transition-colors focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-auto disabled:opacity-100 md:text-sm dark:hover:bg-muted",
            fitContent && FIT_PREVIEW,
            previewClassName,
          )}
        >
          {previewIcon ? (
            <>
              <span className="min-w-0 truncate">{displayValue}</span>
              {previewIcon}
            </>
          ) : (
            displayValue
          )}
        </Button>
      )}
    </div>
  );
}
