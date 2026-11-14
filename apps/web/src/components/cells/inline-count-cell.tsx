import { readCount } from "../add/row-fields";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import type { Saving } from "@/data/client";
import { cn } from "@/lib/utils";
import { CELL_EDITOR_CLASS_NAME, CELL_TRIGGER_CLASS_NAME } from "./cell-trigger";

interface InlineCountCellProps {
  /** What the cell holds, such as "Count", for its accessible name. */
  label: string;
  value: number;
  onSubmit: (newValue: number) => Saving;
  disabled?: boolean;
}

export function InlineCountCell({
  label,
  value,
  onSubmit,
  disabled = false,
}: InlineCountCellProps) {
  const edit = useInlineEdit({
    label,
    value,
    onSubmit,
    disabled,
    format: String,
    toDraft: (count) => count,
    parse: (draft) => draft,
  });

  if (edit.draft !== null) {
    return (
      <div className="grid">
        <Input
          {...edit.editorHandlers}
          id="count"
          name="count"
          aria-label={label}
          autoFocus
          className={CELL_EDITOR_CLASS_NAME}
          value={edit.draft}
          type="number"
          min="1"
          max="999"
          onChange={(e) => edit.setDraft(readCount(e.target.value) ?? 1)}
          placeholder="1"
        />
      </div>
    );
  }

  return (
    <Button
      onClick={edit.handleOpen}
      className={cn(CELL_TRIGGER_CLASS_NAME, "h-8 justify-start text-foreground")}
      variant="ghost"
      disabled={disabled}
      aria-label={edit.triggerLabel}
    >
      {edit.shownText}
    </Button>
  );
}
