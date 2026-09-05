import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseIcon, LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

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
      <Button variant="default" onClick={onSyncCollection}>
        <HugeiconsIcon icon={LibraryIcon} />
        {labels.collection}
      </Button>
      <Button variant="outline" onClick={onSyncOrder}>
        <HugeiconsIcon icon={PackageIcon} />
        {labels.order}
      </Button>
      {onSyncItems ? (
        <Button variant="outline" onClick={onSyncItems}>
          <HugeiconsIcon icon={DatabaseIcon} />
          Add to item database
        </Button>
      ) : null}
    </div>
  );
}
