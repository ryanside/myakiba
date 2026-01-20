import { app } from "@/lib/treaty-client";

export async function getAnalytics() {
  const { data, error } = await app.api.analytics.get();

  if (error) {
    throw new Error(error.value || "Failed to get analytics");
  }
  return data;
}
