import { app } from "@/lib/treaty-client";


export async function getVersion() {
  const { data, error } = await app.api.version.get();
  if (error) {
    throw new Error(error.value?.message || "Failed to get version");
  }
  return data;
}
