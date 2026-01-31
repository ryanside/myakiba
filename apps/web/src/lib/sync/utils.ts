import Papa from "papaparse";
import { csvSchema, type UserItem } from "./types";

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
    transformHeader: (header: string) =>
      header.trim().toLowerCase().replace(/ /g, "_"),
  });

  const validatedCSV = csvSchema.safeParse(parsedCSV.data);
  if (!validatedCSV.success) {
    console.log("Invalid CSV file", validatedCSV.error);
    throw new Error("Please select a valid MyFigureCollection CSV file");
  }

  const filteredData = validatedCSV.data.filter((item) => {
    return (
      (item.status === "Owned" || item.status === "Ordered") &&
      !item.title.startsWith("[NSFW")
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
