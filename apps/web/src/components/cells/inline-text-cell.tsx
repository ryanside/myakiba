import type { FocusEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import { CELL_EDITOR_CLASS_NAME, CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";
import { EmptyValue } from "./empty-value";

interface InlineTextCellProps {
  label: string;
  value: string;
  onSubmit: (value: string) => Promise<void> | void;
  validate?: (value: string) => true | string;
  previewClassName?: string;
  disabled?: boolean;
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
  disabled,
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

  return (
    <div
      className={cn(
        "relative inline-block w-full min-w-0",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {edit.draft === null ? (
        <Button
          type="button"
          variant="ghost"
          aria-label={edit.triggerLabel}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onFocus={edit.handleOpen}
          className={cn(
            CELL_TRIGGER_CLASS_NAME,
            "h-8 cursor-text justify-start truncate text-left text-base font-normal transition-colors focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-auto disabled:opacity-100 md:text-sm dark:hover:bg-muted",
            previewClassName,
          )}
        >
          {edit.shownText ? <span className="truncate">{edit.shownText}</span> : <EmptyValue />}
        </Button>
      ) : (
        <Input
          {...edit.editorHandlers}
          autoFocus
          aria-label={label}
          value={edit.draft}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onFocus={selectFromStart}
          onChange={(event) => edit.setDraft(event.target.value)}
          className={CELL_EDITOR_CLASS_NAME}
        />
      )}
    </div>
  );
}
