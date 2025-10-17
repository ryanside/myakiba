export interface RecentItem {
  id: string;
  type: "order" | "collection";
  title: string;
  timestamp: number;
}

const RECENT_ITEMS_KEY = "recent-items";
const MAX_RECENT_ITEMS = 8;

export function addRecentItem(item: Omit<RecentItem, "timestamp">): void {
  const recent = getRecentItems();
  
  // Remove existing entry if it exists
  const filtered = recent.filter(
    (i) => !(i.id === item.id && i.type === item.type)
  );
  
  // Add new item at the beginning
  const updated = [
    { ...item, timestamp: Date.now() },
    ...filtered,
  ].slice(0, MAX_RECENT_ITEMS);
  
  localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
}

export function getRecentItems(): RecentItem[] {
  try {
    const stored = localStorage.getItem(RECENT_ITEMS_KEY);
    if (!stored) return [];
    
    const items = JSON.parse(stored) as RecentItem[];
    return items.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export function clearRecentItems(): void {
  localStorage.removeItem(RECENT_ITEMS_KEY);
}

