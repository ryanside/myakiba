import { FileUploadIcon, LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { SyncType } from "@myakiba/contracts/shared/types";

export type LaunchableSyncType = Extract<SyncType, "collection" | "csv" | "order">;

export type SyncLauncherOption = {
  readonly type: LaunchableSyncType;
  readonly icon: IconSvgElement;
  readonly description: string;
  readonly keywords: readonly string[];
};

export const LAUNCHABLE_SYNC_OPTIONS = [
  {
    type: "collection",
    icon: LibraryIcon,
    description: "Add items by MFC ID",
    keywords: ["sync", "collection", "item", "mfc"],
  },
  {
    type: "order",
    icon: PackageIcon,
    description: "Create an order with MFC items",
    keywords: ["sync", "order", "purchase", "mfc"],
  },
  {
    type: "csv",
    icon: FileUploadIcon,
    description: "Import from MFC CSV export",
    keywords: ["sync", "csv", "import", "upload"],
  },
] as const satisfies readonly SyncLauncherOption[];
