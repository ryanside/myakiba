import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type AccentTone = { readonly bg: string; readonly fg: string };

interface ConfirmDialogProps {
  readonly renderTrigger?: React.ReactElement;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly confirmLabel?: string;
  readonly loadingLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: ButtonVariant;
  readonly icon?: IconSvgElement;
  readonly onConfirm: () => void | Promise<void>;
  readonly disabled?: boolean;
}

const ACCENT_BY_VARIANT: Record<NonNullable<ButtonVariant>, AccentTone> = {
  default: { bg: "bg-primary/10", fg: "text-primary" },
  destructive: { bg: "bg-destructive/10", fg: "text-destructive" },
  outline: { bg: "bg-muted", fg: "text-foreground" },
  secondary: { bg: "bg-secondary/20", fg: "text-secondary-foreground" },
  ghost: { bg: "bg-muted", fg: "text-foreground" },
  link: { bg: "bg-primary/10", fg: "text-primary" },
};

export function ConfirmDialog({
  renderTrigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  loadingLabel = "Deleting...",
  cancelLabel = "Cancel",
  variant = "destructive",
  icon = AlertCircleIcon,
  onConfirm,
  disabled = false,
}: ConfirmDialogProps): React.ReactElement {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : internalOpen;
  const accent = ACCENT_BY_VARIANT[variant ?? "destructive"];

  const closeDialog = (): void => {
    if (!isControlled) setInternalOpen(false);
    onOpenChange?.(false);
  };

  const handleOpenChange = (next: boolean): void => {
    if (isSubmitting && !next) return;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleConfirm = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      closeDialog();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={actualOpen} onOpenChange={handleOpenChange}>
      {renderTrigger ? <DialogTrigger render={renderTrigger} /> : null}
      {actualOpen ? (
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <div className="flex items-start gap-3 py-1">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                accent.bg,
              )}
            >
              <HugeiconsIcon icon={icon} strokeWidth={2} className={cn("size-5", accent.fg)} />
            </div>
            <div className="flex flex-col justify-center gap-1">
              <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
              {description ? (
                <DialogDescription className="text-muted-foreground text-sm">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={isSubmitting}>
              {cancelLabel}
            </DialogClose>
            <Button
              variant={variant}
              disabled={disabled || isSubmitting}
              onClick={() => {
                void handleConfirm();
              }}
            >
              {isSubmitting ? loadingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
