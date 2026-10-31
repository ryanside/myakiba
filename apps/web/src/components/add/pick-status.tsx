import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PickRow } from "@/data/picks";
import { pickFailureCopy } from "@/lib/pick-failure";
import { cn } from "@/lib/utils";
import { THUMBNAIL } from "./row-fields";

/** A pick's status and actions, layout-free. */
export function PickStatus({
  pick,
  onRetry,
  onDiscard,
}: {
  readonly pick: PickRow;
  readonly onRetry: (mfcItemId: PickRow["mfcItemId"]) => void;
  readonly onDiscard: (mfcItemId: PickRow["mfcItemId"]) => void;
}) {
  const title = pick.title ?? `MFC item #${pick.mfcItemId}`;
  const copy = pick.state === "failed" ? pickFailureCopy(pick.reason, pick.mfcItemId) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        className={cn(THUMBNAIL, "flex items-center justify-center bg-muted")}
        aria-hidden="true"
      >
        {copy ? (
          <HugeiconsIcon icon={Alert02Icon} className="size-5 text-warning" />
        ) : (
          <Spinner className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
        <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{title}</span>
        {copy ? (
          <span className="text-xs text-pretty text-muted-foreground">{copy.text}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Saving…</span>
        )}
      </div>
      {copy ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {copy.actions.map((action) => {
            if (action.kind === "retry") {
              return (
                <Button
                  key="retry"
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Retry ${title}`}
                  onClick={() => onRetry(pick.mfcItemId)}
                >
                  Retry
                </Button>
              );
            }
            if (action.kind === "open") {
              return (
                <a
                  key={action.href}
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm px-1.5 text-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {action.label}
                </a>
              );
            }
            // The verify email notice holds the one resend button.
            return null;
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Discard ${title}`}
            onClick={() => onDiscard(pick.mfcItemId)}
          >
            Discard
          </Button>
        </div>
      ) : null}
    </div>
  );
}
