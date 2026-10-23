import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { DatabaseIcon, LibraryIcon, Loading03Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useExtensionGate } from "@/lib/extension-gate";
import { cn } from "@/lib/utils";

const DEFAULT_LABELS = {
  collection: "Add to collection",
  order: "Create order",
} as const;

function GatedAction({
  variant,
  icon,
  label,
  onProceed,
}: {
  readonly variant: "default" | "outline";
  readonly icon: IconSvgElement;
  readonly label: string;
  readonly onProceed: () => void;
}): ReactNode {
  const { checking, gate } = useExtensionGate();
  return (
    <Button variant={variant} aria-busy={checking || undefined} onClick={() => gate(onProceed)}>
      <HugeiconsIcon
        icon={checking ? Loading03Icon : icon}
        data-icon="inline-start"
        className={cn(checking && "animate-spin motion-reduce:animate-none")}
      />
      {label}
    </Button>
  );
}

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
      <GatedAction
        variant="default"
        icon={LibraryIcon}
        label={labels.collection}
        onProceed={onSyncCollection}
      />
      <GatedAction
        variant="outline"
        icon={PackageIcon}
        label={labels.order}
        onProceed={onSyncOrder}
      />
      {onSyncItems ? (
        <GatedAction
          variant="outline"
          icon={DatabaseIcon}
          label="Add to item database"
          onProceed={onSyncItems}
        />
      ) : null}
    </div>
  );
}
