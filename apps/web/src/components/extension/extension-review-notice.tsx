import { HugeiconsIcon } from "@hugeicons/react";
import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export const EXTENSION_REVIEW_NOTICE = {
  title: "The myakiba browser extension is under review",
  body: "The Chrome Web Store and Firefox Add-ons are reviewing it now, and it will be released shortly. It will be the new way to import items from MyFigureCollection. Until it passes review and is ready to install, importing is unavailable.",
} as const;

/** Says that importing waits on the extension's store review, wherever an import would start. */
export function ExtensionReviewNotice({
  className,
  titleId,
  bodyId,
}: {
  readonly className?: string;
  readonly titleId?: string;
  readonly bodyId?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg bg-muted/45 p-3 text-left ring-1 ring-foreground/8",
        className,
      )}
    >
      <HugeiconsIcon
        icon={PuzzleIcon}
        strokeWidth={2}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p id={titleId} className="text-sm font-medium text-foreground">
          {EXTENSION_REVIEW_NOTICE.title}
        </p>
        <p id={bodyId} className="text-pretty text-sm text-muted-foreground">
          {EXTENSION_REVIEW_NOTICE.body}
        </p>
      </div>
    </div>
  );
}
