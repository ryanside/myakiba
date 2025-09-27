import { client } from "@/lib/hono-client";

export async function getAnalytics() {
  const response = await client.api.analytics.$get();

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
}

export async function getEntryAnalytics(entryCategory: string) {
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
