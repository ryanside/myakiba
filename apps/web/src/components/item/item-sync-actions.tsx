import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";

const DEFAULT_LABELS = {
  collection: "Add to Collection",
  order: "Add to Order",
} as const;

export function ItemSyncActions({
  onSyncCollection,
  onSyncOrder,
  labels = DEFAULT_LABELS,
}: {
  readonly onSyncCollection: () => void;
  readonly onSyncOrder: () => void;
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
    </div>
  );
}
