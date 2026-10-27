import { HugeiconsIcon } from "@hugeicons/react";
import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { UPDATE_LINK, missingExtensionCopy } from "@/components/extension/extension-notice";
import type { ExtensionNoticeCopy } from "@/components/extension/extension-notice";
import { extensionAvailability } from "@/lib/extension-availability";
import { dismissMissingExtension, useMissingExtensionDialog } from "@/lib/extension-gate";
import type { ExtensionMissing } from "@/lib/extension-gate";

const OUTDATED: ExtensionNoticeCopy = {
  title: "Update the myakiba extension",
  body: "This version of the extension is too old for myakiba. Update it, reload this page, then try again.",
  link: UPDATE_LINK,
};

function refusalCopy(refusal: ExtensionMissing): ExtensionNoticeCopy {
  return refusal.kind === "outdated" ? OUTDATED : missingExtensionCopy(extensionAvailability());
}

export function ExtensionRequiredDialog() {
  const dialog = useMissingExtensionDialog();
  const copy = dialog ? refusalCopy(dialog.refusal) : null;

  return (
    <Dialog
      open={dialog?.open ?? false}
      onOpenChange={(open) => {
        if (!open) dismissMissingExtension();
      }}
    >
      {copy ? (
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <div className="flex items-start gap-3 py-1">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <HugeiconsIcon icon={PuzzleIcon} strokeWidth={2} className="size-5 text-primary" />
            </div>
            <div className="flex flex-col justify-center gap-1">
              <DialogTitle className="text-sm font-medium">{copy.title}</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                {copy.body}
              </DialogDescription>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            {copy.link ? (
              <a
                href={copy.link.href}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants()}
              >
                {copy.link.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
