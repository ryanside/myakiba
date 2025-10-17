import { client } from "@/lib/hono-client";
import type { EntryCategory } from "@/lib/analytics/types";

export async function getAnalytics() {
  const response = await client.api.analytics.$get();

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
}

export async function getEntryAnalytics(entryCategory: EntryCategory) {
  const response = await client.api.analytics[":entryCategory"].$get({
    param: {
      entryCategory,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
}
