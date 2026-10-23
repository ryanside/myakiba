import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { RedoIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { useExtensionGate } from "@/lib/extension-gate";
import { retrySyncSession } from "@/queries/sync";
import { importSyncItems } from "@/data/extension-run";
import { toastRunOutcome } from "@/components/extension/run-outcome-toast";

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
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => retrySyncSession(sessionId),
    onSuccess: async ({ jobId, missingMfcItemIds }) => {
      toastRunOutcome(importSyncItems({ sessionId, jobId, mfcItemIds: missingMfcItemIds }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["syncSessionDetail", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["syncSessions"] }),
      ]);
    },
    onError: (retryError) => {
      toast.add({
        type: "error",
        title: "Failed to retry failed item results",
        description: retryError.message,
      });
    },
  });
  const { checking, gate } = useExtensionGate();
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
    <Button
      type="button"
      size="sm"
      className="gap-1"
      disabled={!canRetry || retryIsPending}
      aria-busy={checking || undefined}
      onClick={() => gate(() => mutation.mutate())}
    >
      <HugeiconsIcon
        icon={RedoIcon}
        data-icon="inline-start"
        className={retryIsPending || checking ? "animate-spin" : ""}
      />
      <span>
        {retryIsPending ? "Retrying failed item results..." : "Retry failed item results"}
      </span>
    </Button>
  );

  if (!unavailableReason || retryIsPending) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-default">{button}</span>} />
      <TooltipContent>{unavailableReason}</TooltipContent>
    </Tooltip>
  );
}
