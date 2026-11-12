import { useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A tooltip for a control whose words a narrow sentence hides or cuts short. It opens only while
 * they are, since over words that show whole it would only repeat them. A control with a face for
 * each width gives each face's words `setWords`.
 */
export function useWordsTip() {
  const words = useRef(new Set<HTMLElement>());
  const [open, setOpen] = useState(false);
  const setWords = (element: HTMLElement | null) => {
    if (!element) return;
    words.current.add(element);
    return () => {
      words.current.delete(element);
    };
  };
  const handleOpenChange = (next: boolean) => {
    setOpen(next && [...words.current].some((shown) => shown.scrollWidth > shown.clientWidth));
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
