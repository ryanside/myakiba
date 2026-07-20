import type { SyncTerminalState } from "@myakiba/contracts/sync/schema";
import { ArrowRight01Icon, GitCompareIcon } from "@hugeicons/core-free-icons";
import { showPixelToast } from "@/components/ui/pixel-toast";
import type { PixelToastAction, PixelToastVariant } from "@/components/ui/pixel-toast";

type SyncToastState = SyncTerminalState | "queued";

export type SyncToastData = {
  readonly state: SyncToastState;
  readonly sessionId?: string;
  readonly message?: string;
  readonly description?: string;
  readonly existingItems?: number;
  readonly newItems?: number;
};

const STATE_CONFIG: Record<SyncToastState, { readonly title: string }> = {
  queued: { title: "Sync Queued" },
  success: { title: "Sync Complete" },
  partial: { title: "Sync Partial" },
  timeout: { title: "Sync Timed Out" },
  error: { title: "Sync Failed" },
};

function stateToVariant(state: SyncToastState): PixelToastVariant {
  switch (state) {
    case "queued":
      return "info";
    case "success":
      return "success";
    case "partial":
      return "warning";
    case "timeout":
      return "info";
    case "error":
      return "error";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function buildSyncToastTitle(data: SyncToastData): string {
  const hasCounts = data.existingItems !== undefined && data.newItems !== undefined;
  const nothingToDo = hasCounts && data.existingItems + data.newItems === 0;
  const { title } = STATE_CONFIG[data.state];

  if (nothingToDo && data.state !== "queued") {
    return "Already Synced";
  }

  return title;
}

function buildSyncToastDescription(data: SyncToastData): string | undefined {
  const { state, message, description, existingItems, newItems } = data;
  const hasCounts = existingItems !== undefined && newItems !== undefined;
  const nothingToDo = hasCounts && existingItems + newItems === 0;

  if (hasCounts) {
    if (state === "queued") {
      const parts = [`Processing ${newItems} items`];
      if (existingItems > 0) {
        parts.push(`${existingItems} already synced`);
      }
      return parts.join(", ");
    }

    if (nothingToDo) {
      return "All items are already in your collection.";
    }

    return `${existingItems + newItems} items synced`;
  }

  if (message !== undefined && description !== undefined) {
    return `${message} — ${description}`;
  }

  return message ?? description;
}

function buildSyncToastAction(data: SyncToastData): PixelToastAction {
  const sessionId = data.sessionId;
  if (sessionId !== undefined) {
    return {
      label: "View Status",
      icon: ArrowRight01Icon,
      to: "/sync/$id",
      params: { id: sessionId },
    };
  }

  return {
    label: "View History",
    icon: GitCompareIcon,
    to: "/sync",
  };
}

export function showSyncToast(data: SyncToastData): void {
  showPixelToast({
    title: buildSyncToastTitle(data),
    description: buildSyncToastDescription(data),
    variant: stateToVariant(data.state),
    action: buildSyncToastAction(data),
  });
}
