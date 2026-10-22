import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseIcon, LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { requireExtension } from "@/lib/extension-gate";

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
  const withExtension = (open: () => void) => async () => {
    if (await requireExtension()) open();
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
      <Button variant="default" onClick={withExtension(onSyncCollection)}>
        <HugeiconsIcon icon={LibraryIcon} data-icon="inline-start" />
        {labels.collection}
      </Button>
      <Button variant="outline" onClick={withExtension(onSyncOrder)}>
        <HugeiconsIcon icon={PackageIcon} data-icon="inline-start" />
        {labels.order}
      </Button>
      {onSyncItems ? (
        <Button variant="outline" onClick={withExtension(onSyncItems)}>
          <HugeiconsIcon icon={DatabaseIcon} data-icon="inline-start" />
          Add to item database
        </Button>
      ) : null}
    </div>
  );
}
