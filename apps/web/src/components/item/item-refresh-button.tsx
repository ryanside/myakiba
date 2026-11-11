import type { ReactNode } from "react";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { GatedButton } from "@/components/extension/gated-button";

export function ItemRefreshButton({
  isPending,
  onRequest,
  disabled = false,
}: {
  readonly isPending: boolean;
  readonly onRequest: () => void;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <GatedButton
      variant="outline"
      disabled={disabled || isPending}
      icon={Refresh01Icon}
      pending={isPending}
      onProceed={onRequest}
    >
      {isPending ? "Requesting..." : "Refresh item details"}
    </GatedButton>
  );
}
