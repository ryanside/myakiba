import { client } from "@/lib/hono-client";
import type { userItem } from "@/lib/sync/types";

export async function getJobStatus(jobId: string) {
  const response = await client.api.sync.sse.$get({
    query: {
      jobId: jobId,
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function sendItems(userItems: userItem[]) {
  const response = await client.api.sync.csv.$post({
    json: userItems,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json();
}

