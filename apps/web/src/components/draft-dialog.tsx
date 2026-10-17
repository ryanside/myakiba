import { Fragment, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export function DraftDialog({
  trigger,
  className,
  children,
}: {
  readonly trigger: ReactElement;
  readonly className?: string;
  readonly children: (close: () => void) => ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) setOpenCount((count) => count + 1);
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className={className}>
        <Fragment key={openCount}>{children(() => setOpen(false))}</Fragment>
      </DialogContent>
    </Dialog>
  );
}
