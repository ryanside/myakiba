import Papa from "papaparse";
import { csvSchema } from "@myakiba/contracts/sync/schema";
import { SYNC_CSV_ITEM_STATUSES } from "@myakiba/contracts/sync/constants";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type {
  UserItem,
  SyncFormOrder,
  SyncFormOrderItem,
  SyncFormCollectionItem,
  SyncSessionRow,
} from "@myakiba/contracts/sync/types";
import type {
  SyncType,
  SyncSessionStatus,
  SyncSessionItemStatus,
} from "@myakiba/contracts/shared/types";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";

export const SESSION_STATUS_CONFIG: Record<
  SyncSessionStatus,
  {
    readonly label: string;
    readonly variant: "success" | "warning" | "destructive" | "info" | "secondary";
  }
> = {
  pending: { label: "Pending", variant: "secondary" },
  processing: { label: "Processing", variant: "info" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  partial: { label: "Partial", variant: "warning" },
};

export const SYNC_TYPE_CONFIG: Record<
  SyncType,
  {
    readonly label: string;
    readonly variant: "default" | "info" | "secondary";
  }
> = {
  csv: { label: "CSV", variant: "default" },
  order: { label: "Order", variant: "info" },
  "order-item": { label: "Order Item", variant: "secondary" },
  collection: { label: "Collection", variant: "secondary" },
};

/**
 * Chooses the one sync status sentence the UI should show for a session.
 *
 * Use this in widgets, table cells, banners, and toasts when the goal is to
 * match backend-persisted status text while still preferring the most recent
 * item outcome from the live stream.
 *
 * Precedence:
 * 1. stream error copy
 * 2. terminal `jobStatus.statusMessage` (summary — wins over per-item ticker)
 * 3. latest recent-item outcome from the live stream
 * 4. live `jobStatus.statusMessage`
 * 5. persisted `session.statusMessage`
 *
 * The recent-item override is intentionally skipped once the job has reached a
 * terminal state, otherwise a completion toast or final banner would show the
 * per-item ticker ("Synced {last item}") instead of the aggregate summary
 * ("Synced 10/10 items").
 *
 * This helper only decides the sentence. Badge label, spinner state, and
 * container styling should stay at the call site.
 *
 * @example
 * resolveSyncMessage(
 *   { statusMessage: "Sync queued" },
 *   {
 *     jobId: "job_123",
 *     phase: "scraping",
 *     statusMessage: "Scraping 4/10 items",
 *     progress: { processed: 4, total: 10, succeeded: 3, failed: 1 },
 *     recentItems: [],
 *     error: null,
 *     startedAt: "2026-04-19T00:00:00.000Z",
 *     updatedAt: "2026-04-19T00:00:01.000Z",
 *     terminalState: null,
 *   },
 *   false,
 * )
 * // "Scraping 4/10 items"
 *
 * @example
 * resolveSyncMessage({ statusMessage: "Scraping 4/10 items" }, null, true)
 * // "Lost connection - refresh to see latest status"
 */
export function resolveSyncMessage(
  session: Pick<SyncSessionRow, "statusMessage">,
  jobStatus: SyncJobStatus | null,
  isStreamError: boolean,
): string {
  if (isStreamError) {
    return SYNC_STATUS_MESSAGES.streamError;
  }

  if (jobStatus?.terminalState != null) {
    return jobStatus.statusMessage;
  }

  const recentItem = jobStatus?.recentItems[0];
  if (recentItem) {
    return SYNC_STATUS_MESSAGES.itemOutcome(recentItem);
  }

  return jobStatus?.statusMessage ?? session.statusMessage;
}

export const ITEM_STATUS_CONFIG: Record<
  SyncSessionItemStatus,
  {
    readonly label: string;
    readonly variant: "secondary" | "success" | "destructive";
  }
> = {
  pending: { label: "Pending", variant: "secondary" },
  scraped: { label: "Scraped", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export const SYNC_OPTION_META: Record<
  SyncType,
  { readonly title: string; readonly description: string }
> = {
  collection: {
    title: "Sync Collection",
    description: "Add to your collection using MyFigureCollection Item IDs/links.",
  },
  order: {
    title: "Sync Order",
    description: "Create and add an order using MyFigureCollection Item IDs/links.",
  },
  "order-item": {
    title: "Add Order Items",
    description: "Add items to an existing order using MyFigureCollection Item IDs/links.",
  },
  csv: {
    title: "Sync CSV",
    description:
      "Sync your MyFigureCollection and myakiba using MyFigureCollection CSV. You can export your CSV by going to myfigurecollection.net > User Menu > Manager > CSV Export (with all fields checked, Choose ',' (comma) for the settings option).",
  },
} as const;

const SYNC_CSV_STATUS_SET: ReadonlySet<string> = new Set(SYNC_CSV_ITEM_STATUSES);
const csvTransformationCache = new WeakMap<File, Promise<UserItem[]>>();

export function createDefaultSyncFormOrderItem(itemExternalId = ""): SyncFormOrderItem {
  return {
    formRowId: crypto.randomUUID(),
    itemExternalId,
    price: "0.00",
    count: 1,
    status: "Ordered",
    condition: "New",
    shippingMethod: "n/a",
    orderDate: "",
    paymentDate: "",
    shippingDate: "",
    collectionDate: "",
  };
}

export function createDefaultSyncFormOrder(itemExternalId = ""): SyncFormOrder {
  return {
    status: "Ordered",
    title: "New Order",
    shop: "",
    orderDate: "",
    releaseDate: "",
    paymentDate: "",
    shippingDate: "",
    collectionDate: "",
    shippingMethod: "n/a",
    shippingFee: "0.00",
    taxes: "0.00",
    duties: "0.00",
    tariffs: "0.00",
    miscFees: "0.00",
    notes: "",
    items: [createDefaultSyncFormOrderItem(itemExternalId)],
  };
}

export function createDefaultSyncFormCollectionItem(itemExternalId = ""): SyncFormCollectionItem {
  return {
    formRowId: crypto.randomUUID(),
    itemExternalId,
    price: "0.00",
    count: 1,
    score: 0,
    shop: "",
    orderDate: "",
    paymentDate: "",
    shippingDate: "",
    collectionDate: "",
    shippingMethod: "n/a",
    tags: [],
    condition: "New",
    notes: "",
  };
}

export function transformCSVData(value: { file: File | undefined }): Promise<UserItem[]> {
  if (!value.file) {
    return Promise.reject(new Error("No file selected"));
  }

  const cachedTransformation = csvTransformationCache.get(value.file);
  if (cachedTransformation) {
    return cachedTransformation;
  }

  // oxlint-disable-next-line promise/prefer-await-to-then -- Preserve one cached promise per File.
  const transformation = value.file.text().then((text) => {
    const parsedCSV = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase().replaceAll(" ", "_"),
    });

    const validatedCSV = csvSchema.safeParse(parsedCSV.data);
    if (!validatedCSV.success) {
      if (import.meta.env.DEV) {
        console.log("Invalid CSV file", validatedCSV.error);
      }
      throw new Error("Please select a valid MyFigureCollection CSV file");
    }

    const filteredData = validatedCSV.data.filter((item) => {
      return SYNC_CSV_STATUS_SET.has(item.status) && !item.title.startsWith("[NSFW");
    });
    if (filteredData.length === 0) {
      throw new Error("No Owned or Ordered items to sync");
    }
    if (import.meta.env.DEV) {
      console.log("Filtered data:", filteredData);
    }
    const userItems: UserItem[] = filteredData.map((item) => {
      const normalizedStatus = item.status === "Ordered" ? "Ordered" : "Owned";
      return {
        itemExternalId: item.id,
        status: normalizedStatus,
        count: item.count,
        score: item.score,
        payment_date: item.payment_date,
        shipping_date: item.shipping_date,
        collecting_date: item.collecting_date,
        price: item.price_1,
        shop: item.shop,
        shipping_method: item.shipping_method,
        note: item.note,
        orderId: null,
        orderDate: item.payment_date,
      };
    });
    return userItems;
  });

  csvTransformationCache.set(value.file, transformation);
  return transformation;
}
