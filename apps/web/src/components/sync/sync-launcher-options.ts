import { FileUploadIcon, LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { SyncType } from "@myakiba/contracts/shared/types";

export type LaunchableSyncType = Extract<SyncType, "collection" | "csv" | "order">;

export type SyncLauncherOption = {
  readonly type: LaunchableSyncType;
  readonly icon: IconSvgElement;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
};

export const LAUNCHABLE_SYNC_OPTIONS = [
  {
    type: "collection",
    label: "Collection",
    icon: LibraryIcon,
    description: "Paste MyFigureCollection item links or IDs to add items to your collection",
    keywords: ["add", "collection", "item", "mfc", "myfigurecollection", "sync"],
  },
  {
    type: "order",
    label: "Order",
    icon: PackageIcon,
    description: "Paste MyFigureCollection item links or IDs to create an order",
    keywords: ["create", "add", "order", "purchase", "mfc", "myfigurecollection", "sync"],
  },
  {
    type: "csv",
    label: "MyFigureCollection CSV",
    icon: FileUploadIcon,
    description: "Upload your MyFigureCollection CSV export",
    keywords: ["csv", "import", "upload", "mfc", "myfigurecollection", "sync"],
  },
] as const satisfies readonly SyncLauncherOption[];
