import { useEffect, useRef } from "react";
import type { ComponentProps, FocusEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SuggestInput } from "@/components/ui/suggest-input";
import { cn } from "@/lib/utils";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import type { Saving } from "@/data/client";
import { CELL_EDITOR_CLASS_NAME, CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";
import { EmptyValue } from "./empty-value";

interface InlineTextCellProps {
  label: string;
  value: string;
  onSubmit: (value: string) => Saving;
  validate?: (value: string) => true | string;
  previewClassName?: string;
  /** Sits right after the value, and stays in view when the value truncates. */
  previewIcon?: ReactNode;
  /** The preview and the input are as wide as their text, up to the row's width, not always that wide. */
  fitContent?: boolean;
  disabled?: boolean;
  /** Offers suggestions while editing, and saves a picked one at once. */
  suggest?: (query: string) => readonly string[];
}

// A box that hugs its text needs room inside. Its text stays put, as the room goes out to the start.
const FIT = "-ms-1.5 max-w-[calc(100%+0.375rem)] px-1.5";
const FIT_PREVIEW = `${FIT} w-fit`;
const FIT_INPUT = `${FIT} field-sizing-content w-auto min-w-40`;

type EditorProps = Omit<ComponentProps<"input">, "value" | "onChange"> & {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly suggest: ((query: string) => readonly string[]) | undefined;
  readonly onPick: (value: string) => Promise<void>;
};

function Editor({ value, onValueChange, suggest, onPick, ...props }: EditorProps) {
  if (!suggest) {
    return (
      <Input {...props} value={value} onChange={(event) => onValueChange(event.target.value)} />
    );
  }
  return (
    <SuggestInput
      {...props}
      value={value}
      onValueChange={onValueChange}
      suggestions={suggest(value)}
      onPick={onPick}
    />
  );
}

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
  previewIcon,
  fitContent,
  disabled,
  suggest,
}: InlineTextCellProps): React.ReactElement {
  const edit = useInlineEdit({
    label,
    value,
    onSubmit,
    validate,
    disabled,
    format: (text) => text,
    toDraft: (text) => text,
    parse: (draft) => draft,
  });
  const preview = useRef<HTMLButtonElement>(null);
  // Enter and Escape remove the focused input, so focus returns to the preview, without editing.
  const returningFocus = useRef(false);
  const isEditing = edit.draft !== null;

  // A save can disable the preview for a moment, so this waits. By then focus may have moved on.
  useEffect(() => {
    if (isEditing || disabled || !returningFocus.current) return;
    if (document.activeElement === document.body) preview.current?.focus();
    else returningFocus.current = false;
  }, [isEditing, disabled]);

  return (
    <div
      className={cn(
        "relative inline-block w-full min-w-0",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {edit.draft === null ? (
        <Button
          ref={preview}
          type="button"
          variant="ghost"
          aria-label={edit.triggerLabel}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            edit.handleOpen();
          }}
          onFocus={() => {
            if (returningFocus.current) returningFocus.current = false;
            else edit.handleOpen();
          }}
          className={cn(
            CELL_TRIGGER_CLASS_NAME,
            "h-8 cursor-text justify-start truncate text-left text-base font-normal transition-colors focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-auto disabled:opacity-100 md:text-sm dark:hover:bg-muted",
            fitContent && FIT_PREVIEW,
            previewClassName,
          )}
        >
          {edit.shownText ? (
            <span className="min-w-0 truncate">{edit.shownText}</span>
          ) : (
            <EmptyValue />
          )}
          {previewIcon}
        </Button>
      ) : (
        <Editor
          {...edit.editorHandlers}
          onKeyDown={async (event) => {
            if (event.key === "Enter" || event.key === "Escape") returningFocus.current = true;
            // Focus is on the preview by the key's next event, which would click it open again.
            if (event.key === "Enter") event.preventDefault();
            await edit.editorHandlers.onKeyDown(event);
          }}
          autoFocus
          aria-label={label}
          // Holds the width where `field-sizing` is not supported, and is ignored where it is.
          size={fitContent ? Math.max(edit.draft.length + 1, 20) : undefined}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onFocus={selectFromStart}
          className={cn(CELL_EDITOR_CLASS_NAME, fitContent && FIT_INPUT)}
          value={edit.draft}
          onValueChange={(next) => edit.setDraft(next)}
          suggest={suggest}
          onPick={async (picked) => {
            returningFocus.current = true;
            await edit.commit(picked);
          }}
        />
      )}
    </div>
  );
}
