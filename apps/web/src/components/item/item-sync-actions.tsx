import type { ReactNode } from "react";
import { DatabaseIcon, LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { GatedButton } from "@/components/extension/gated-button";

const DEFAULT_LABELS = {
  collection: "Add to collection",
  order: "Create order",
} as const;

export function ItemSyncActions({
  onSyncCollection,
  onSyncOrder,
  onSyncItems,
  labels = DEFAULT_LABELS,
}: {
  readonly onSyncCollection: () => void;
  readonly onSyncOrder: () => void;
  readonly onSyncItems?: () => void;
  readonly labels?: {
    readonly collection: string;
    readonly order: string;
  };
}): ReactNode {
  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
      <GatedButton variant="default" icon={LibraryIcon} onProceed={onSyncCollection}>
        {labels.collection}
      </GatedButton>
      <GatedButton variant="outline" icon={PackageIcon} onProceed={onSyncOrder}>
        {labels.order}
      </GatedButton>
      {onSyncItems ? (
        <GatedButton variant="outline" icon={DatabaseIcon} onProceed={onSyncItems}>
          Add to item database
        </GatedButton>
      ) : null}
    </div>
  );
}
