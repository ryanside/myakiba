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
import { useId } from "react";
import { EXTENSION_FAQ_HREF } from "@/components/homepage/faqs";
import { ExtensionReviewNotice } from "@/components/extension/extension-review-notice";
import { dismissMissingExtension, useMissingExtensionDialog } from "@/lib/extension-gate";
import type { ExtensionMissing } from "@/lib/errors/extension-missing";

const COPY = {
  absent: {
    title: "Install the myakiba extension first",
    description:
      "myakiba gets MyFigureCollection items through its browser extension, with your own MyFigureCollection sign-in. Install it, reload this page, then try again.",
    link: "How to install it",
  },
  outdated: {
    title: "Update the myakiba extension",
    description:
      "This version of the extension is too old for myakiba. Update it, reload this page, then try again.",
    link: "How to update it",
  },
} as const satisfies Record<ExtensionMissing["kind"], Record<string, string>>;

export function ExtensionRequiredDialog() {
  const dialog = useMissingExtensionDialog();
  const titleId = useId();
  const bodyId = useId();
  const refusal = dialog?.refusal.kind ?? null;
  const copy = refusal === null || refusal === "in_review" ? null : COPY[refusal];

  return (
    <Dialog
      open={dialog?.open ?? false}
      onOpenChange={(open) => {
        if (!open) dismissMissingExtension();
      }}
    >
      {refusal === "in_review" ? (
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
        >
          <ExtensionReviewNotice
            className="bg-transparent p-1 ring-0"
            titleId={titleId}
            bodyId={bodyId}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      ) : null}
      {copy ? (
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <div className="flex items-start gap-3 py-1">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <HugeiconsIcon icon={PuzzleIcon} strokeWidth={2} className="size-5 text-primary" />
            </div>
            <div className="flex flex-col justify-center gap-1">
              <DialogTitle className="text-sm font-medium">{copy.title}</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                {copy.description}
              </DialogDescription>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            <a
              href={EXTENSION_FAQ_HREF}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants()}
            >
              {copy.link}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
