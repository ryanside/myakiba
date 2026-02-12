import * as z from "zod";

export interface RecentItem {
  id: string;
  type: "order" | "collection";
  title: string;
  images: string[];
  timestamp: number;
}

const RECENT_ITEMS_KEY = "recent-items";
const MAX_RECENT_ITEMS = 8;
const recentItemSchema = z.object({
  id: z.string(),
  type: z.enum(["order", "collection"]),
  title: z.string(),
  images: z.array(z.string()).default([]),
  timestamp: z.number(),
});
const recentItemsSchema = z.array(recentItemSchema);

export function addRecentItem(item: Omit<RecentItem, "timestamp">): void {
  const recent = getRecentItems();

  const filtered = recent.filter((i) => !(i.id === item.id && i.type === item.type));

  const images = (item.images || []).slice(0, 4);

  const updated = [{ ...item, images, timestamp: Date.now() }, ...filtered].slice(
    0,
    MAX_RECENT_ITEMS,
  );

  localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
}

export function getRecentItems(): RecentItem[] {
  const stored = localStorage.getItem(RECENT_ITEMS_KEY);
  if (!stored) return [];

  try {
    const parsedItems = recentItemsSchema.safeParse(JSON.parse(stored));
    if (!parsedItems.success) return [];
    return parsedItems.data.toSorted((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Error parsing recent items:", error);
    return [];
  }
}

export function clearRecentItems(): void {
  localStorage.removeItem(RECENT_ITEMS_KEY);
}
