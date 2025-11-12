"use client";

import * as React from "react";
import * as Editable from "@/components/ui/editable";
import { cn } from "@/lib/utils";

interface InlineEditableCellProps {
  value: string;
  onSubmit: (value: string) => Promise<void> | void;
  validate?: (value: string) => boolean | string;
  previewClassName?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export function InlineEditableCell({
  value,
  onSubmit,
  validate,
  previewClassName,
  inputClassName,
  placeholder,
  disabled,
  readOnly,
}: InlineEditableCellProps): React.ReactElement {
  const [isEditing, setIsEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = React.useCallback(
    async (newValue: string) => {
      // Validate if validator provided
      if (validate) {
        const validationResult = validate(newValue);
        if (validationResult !== true) {
          setError(
            typeof validationResult === "string"
              ? validationResult
              : "Invalid value"
          );
          return;
        }
      }

      setError(null);
      setIsEditing(false);

      // Call the onSubmit callback
      try {
        await onSubmit(newValue);
      } catch (err) {
        console.error("Failed to submit edit:", err);
      }
    },
    [onSubmit, validate]
  );

  const handleEdit = React.useCallback(() => {
    setIsEditing(true);
    setError(null);
  }, []);

  const handleCancel = React.useCallback(() => {
    setIsEditing(false);
    setError(null);
  }, []);

  return (
    <Editable.Root
      value={value}
      onSubmit={handleSubmit}
      onEdit={handleEdit}
      onCancel={handleCancel}
      editing={isEditing}
      onEditingChange={setIsEditing}
      triggerMode="dblclick"
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      invalid={!!error}
    >
      <Editable.Area
        className="w-full"
        onClick={(e) => {
          // Stop propagation to prevent row selection/expand
          e.stopPropagation();
        }}
      >
        <Editable.Preview
          className={cn(
            "w-full cursor-text",
            error && "text-destructive",
            previewClassName
          )}
        />
        <Editable.Input
          className={cn("w-full", inputClassName)}
          onClick={(e) => {
            // Stop propagation to prevent row selection/expand
            e.stopPropagation();
          }}
        />
      </Editable.Area>
      {error && (
        <div className="text-xs text-destructive mt-1">{error}</div>
      )}
    </Editable.Root>
  );
}

