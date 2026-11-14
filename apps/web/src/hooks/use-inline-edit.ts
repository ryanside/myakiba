import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { toast } from "@/components/ui/toast";
import type { Saving } from "@/data/client";
import { usePendingValue } from "@/hooks/use-pending-value";
import { runSubmit } from "@/lib/form-submit";

interface InlineEditOptions<Value, Draft extends string | number> {
  /** What the cell holds, such as "Shop", for the trigger's accessible name. */
  label: string;
  value: Value;
  onSubmit: (value: Value) => Saving;
  /** The text the trigger shows. An empty string reads as Empty. */
  format: (value: Value) => string;
  toDraft: (value: Value) => Draft;
  /** The value a draft saves, or null when it saves nothing. */
  parse: (draft: Draft) => Value | null;
  /** Runs only on a changed value. A string is the error to show instead of saving. */
  validate?: (value: Value) => true | string;
  disabled?: boolean;
}

interface InlineEdit<Draft> {
  shownText: string;
  triggerLabel: string;
  /** What the editor holds, or null while the cell is closed. */
  draft: Draft | null;
  setDraft: (draft: Draft) => void;
  handleOpen: () => void;
  /** Saves `draft` at once, as a picked suggestion does. */
  commit: (draft: Draft) => Promise<void>;
  /** Enter or leaving the editor saves. Escape closes it without saving. */
  editorHandlers: {
    onBlur: () => Promise<void>;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => Promise<void>;
  };
}

function useInlineEdit<Value, Draft extends string | number>({
  label,
  value,
  onSubmit,
  format,
  toDraft,
  parse,
  validate,
  disabled = false,
}: InlineEditOptions<Value, Draft>): InlineEdit<Draft> {
  const [draft, setDraft] = useState<Draft | null>(null);
  const liveDraft = useRef<Draft | null>(null);
  const [shown, submit] = usePendingValue(value, onSubmit);
  const shownText = format(shown);

  const changeDraft = (next: Draft | null) => {
    liveDraft.current = next;
    setDraft(next);
  };

  const save = async (current: Draft | null = liveDraft.current): Promise<void> => {
    if (current === null || liveDraft.current === null) return;
    changeDraft(null);
    const next = parse(current);
    if (next === null || Object.is(next, shown)) return;
    const validation = validate?.(next) ?? true;
    if (validation !== true) {
      toast.add({ type: "error", title: validation });
      return;
    }
    await submit(next);
  };

  return {
    shownText,
    triggerLabel: `${shownText || "Empty"}, edit ${label}`,
    draft,
    setDraft: changeDraft,
    handleOpen: () => changeDraft(toDraft(shown)),
    commit: (current) => runSubmit(() => save(current)),
    editorHandlers: {
      onBlur: async () => {
        if (!disabled) await runSubmit(() => save());
      },
      onKeyDown: async (event) => {
        if (event.key === "Enter") {
          await runSubmit(() => save());
        } else if (event.key === "Escape") {
          changeDraft(null);
        }
      },
    },
  };
}

export { useInlineEdit };
