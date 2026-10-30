import type { ReactNode } from "react";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { GatedButton } from "@/components/extension/gated-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RefreshStatus } from "@/components/item/types";

const REFRESH_LABELS = {
  idle: "Refresh item details",
  cooldown: "Recently refreshed",
} satisfies Readonly<Record<RefreshStatus, string>>;

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

export function ItemRefreshButton({
  status,
  isPending,
  cooldownExpiresAt,
  onRequest,
  disabled = false,
}: {
  readonly status: RefreshStatus;
  readonly isPending: boolean;
  readonly cooldownExpiresAt: string | null;
  readonly onRequest: () => void;
  readonly disabled?: boolean;
}): ReactNode {
  const isDisabled = disabled || status !== "idle" || isPending;
  const buttonLabel = isPending ? "Requesting..." : REFRESH_LABELS[status];
  const showCooldownTooltip = status === "cooldown" && cooldownExpiresAt !== null;
  const cooldownRemaining = cooldownExpiresAt ? formatCooldownRemaining(cooldownExpiresAt) : "";

  const button = (
    <GatedButton
      variant="outline"
      size="xs"
      disabled={isDisabled}
      icon={Refresh01Icon}
      pending={isPending}
      onProceed={onRequest}
    >
      {buttonLabel}
    </GatedButton>
  );

  if (showCooldownTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-default">{button}</span>} />
        <TooltipContent>
          {cooldownRemaining ? `Available again in ${cooldownRemaining}` : REFRESH_LABELS.cooldown}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
