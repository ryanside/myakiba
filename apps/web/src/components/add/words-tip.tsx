import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A tooltip for a control whose words a narrow sentence hides or cuts short. It opens only while
 * they are, since over words that show whole it would only repeat them.
 */
export function useWordsTip() {
  const [words, setWords] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setOpen(next && words !== null && words.scrollWidth > words.clientWidth);
  };
  return { setWords, open, handleOpenChange };
}

export function WordsTip({
  open,
  onOpenChange,
  content,
  trigger,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly content: ReactNode;
  readonly trigger: ReactElement;
}) {
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger render={trigger} />
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}
