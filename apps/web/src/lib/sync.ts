import Papa from "papaparse";
import { csvSchema } from "@myakiba/schemas";
import type { UserItem, SyncType, SyncSessionStatus, SyncSessionItemStatus } from "@myakiba/types";

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
    readonly variant: "primary" | "info" | "secondary";
  }
> = {
  csv: { label: "CSV", variant: "primary" },
  order: { label: "Order", variant: "info" },
  collection: { label: "Collection", variant: "secondary" },
};

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
    description: "Add to your collection using MyFigureCollection Item IDs.",
  },
  order: {
    title: "Sync Order",
    description: "Create and add an order using MyFigureCollection Item IDs.",
  },
  csv: {
    title: "Sync CSV",
    description:
      "Sync your MyFigureCollection and myakiba using MyFigureCollection CSV. You can export your CSV by going to myfigurecollection.net > User Menu > Manager > CSV Export (with all fields checked, Choose ',' (comma) for the settings option).",
  },
} as const;

/**
 * Extracts the MyFigureCollection item ID from a URL or returns the ID if it's already a number.
 * Handles URLs like: https://myfigurecollection.net/item/998271
 * Also handles trailing slashes, query parameters, and fragments.
 *
 * @param input - Either a MyFigureCollection URL or a numeric ID string
 * @returns The extracted item ID as a string, or null if invalid
 */
export function extractMfcItemId(input: string): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();

  // If it's already just a number, return it
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Try to extract ID from URL
  // Pattern: https://myfigurecollection.net/item/{id}
  // Also handles: http://, trailing slashes, query params, fragments
  const urlPattern = /myfigurecollection\.net\/item\/(\d+)/i;
  const match = trimmed.match(urlPattern);

  if (match && match[1]) {
    return match[1];
  }

  // If no match found, return null
  return null;
}

export async function transformCSVData(value: { file: File | undefined }) {
  if (!value.file) {
    throw new Error("No file selected");
  }
  const text = await value.file.text();
  const parsedCSV = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase().replace(/ /g, "_"),
  });

  const validatedCSV = csvSchema.safeParse(parsedCSV.data);
  if (!validatedCSV.success) {
    console.log("Invalid CSV file", validatedCSV.error);
    throw new Error("Please select a valid MyFigureCollection CSV file");
  }

  const filteredData = validatedCSV.data.filter((item) => {
    return (
      (item.status === "Owned" || item.status === "Ordered") && !item.title.startsWith("[NSFW")
    );
  });
  if (filteredData.length === 0) {
    throw new Error("No Owned or Ordered items to sync");
  }
  console.log("Filtered data:", filteredData);
  const userItems: UserItem[] = filteredData.map((item) => {
    return {
      itemExternalId: Number(item.id),
      status: item.status as "Owned" | "Ordered",
      count: Number(item.count),
      score: item.score.split("/")[0],
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
}
