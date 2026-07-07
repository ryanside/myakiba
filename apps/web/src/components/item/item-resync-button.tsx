import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ResyncStatus } from "@/components/item/types";

const RESYNC_LABELS: Readonly<Record<ResyncStatus, string>> = {
  idle: "Update data",
  requested: "Update requested",
  processing: "Updating now",
  cooldown: "Recently updated",
};

function formatCooldownRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) return `${days}d ${remainingHours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.ceil(ms / (1000 * 60));
  return `${minutes}m`;
}

export function ItemResyncButton({
  status,
  isPending,
  cooldownExpiresAt,
  onRequest,
}: {
  readonly status: ResyncStatus;
  readonly isPending: boolean;
  readonly cooldownExpiresAt: string | null;
  readonly onRequest: () => void;
}): ReactNode {
  const isDisabled = status !== "idle" || isPending;
  const buttonLabel = isPending ? "Requesting..." : RESYNC_LABELS[status];
  const showCooldownTooltip = status === "cooldown" && cooldownExpiresAt !== null;
  const cooldownRemaining = cooldownExpiresAt ? formatCooldownRemaining(cooldownExpiresAt) : "";

  const button = (
    <Button variant="ghost" size="xs" disabled={isDisabled} onClick={onRequest} className="gap-1.5">
      <HugeiconsIcon
        icon={isPending ? Loading03Icon : Refresh01Icon}
        className={cn("size-3", isPending && "animate-spin")}
      />
      {buttonLabel}
    </Button>
  );

  if (showCooldownTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-default">{button}</span>} />
        <TooltipContent>
          {cooldownRemaining ? `Available again in ${cooldownRemaining}` : RESYNC_LABELS.cooldown}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
