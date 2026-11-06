import { requireData } from "@/lib/api-response";
import { app } from "@/lib/treaty-client";

export async function getVersion() {
  return requireData(app.api.version.get(), "Failed to get version");
}
