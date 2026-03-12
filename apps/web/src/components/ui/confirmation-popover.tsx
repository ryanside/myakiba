import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ConfirmationPopoverProps {
  trigger: React.ReactNode;
  title: string;
  onConfirm: () => void | Promise<void>;
  tooltipContent?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
}

export function ConfirmationPopover({
  trigger,
  title,
  onConfirm,
  tooltipContent,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  disabled = false,
}: ConfirmationPopoverProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleConfirm = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col items-center gap-2 text-sm text-pretty">
          <div className="flex flex-row items-center gap-2 mr-auto">
            <p>{title}</p>
            {tooltipContent && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HugeiconsIcon icon={InformationCircleIcon} className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent className="max-h-40">
                  <p>{tooltipContent}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex flex-row items-center gap-2 max-w-16 mr-auto">
            <PopoverClose asChild>
              <Button variant="outline" className="block" disabled={isSubmitting}>
                {cancelLabel}
              </Button>
            </PopoverClose>
            <Button
              variant="destructive"
              disabled={disabled || isSubmitting}
              className="block"
              onClick={handleConfirm}
            >
              {isSubmitting ? "Deleting..." : confirmLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
