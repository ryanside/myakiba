import type { ReactNode } from "react";
import { RedoIcon } from "@hugeicons/core-free-icons";
import { GatedButton } from "@/components/extension/gated-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRetrySyncSession } from "@/data/resources/sync";

export function RetrySyncSessionButton({
  sessionId,
  retrySupported,
  canRetry,
  isRetrying,
  failCount,
}: {
  readonly sessionId: string;
  readonly retrySupported: boolean;
  readonly canRetry: boolean;
  readonly isRetrying: boolean;
  readonly failCount: number;
}): ReactNode {
  const mutation = useRetrySyncSession();
  const retryIsPending = mutation.isPending || isRetrying;
  let unavailableReason: string | null = null;
  if (!retrySupported) {
    unavailableReason = "This import was created before failed item retries were supported.";
  } else if (failCount === 0) {
    unavailableReason = "This import has no failed item results to retry.";
  } else if (!canRetry) {
    unavailableReason = "Retry is not available for this import.";
  }

  const button = (
    <GatedButton
      type="button"
      size="sm"
      className="gap-1"
      disabled={!canRetry || retryIsPending}
      icon={RedoIcon}
      pending={retryIsPending}
      onProceed={() => mutation.run(sessionId)}
    >
      <span>
        {retryIsPending ? "Retrying failed item results..." : "Retry failed item results"}
      </span>
    </GatedButton>
  );

  if (!unavailableReason || retryIsPending) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-default">{button}</span>} />
      <TooltipContent>{unavailableReason}</TooltipContent>
    </Tooltip>
  );
}
