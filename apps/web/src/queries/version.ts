import { readResponse } from "@/lib/read-response";
import { app } from "@/lib/treaty-client";

export async function getVersion() {
  return readResponse(app.api.version.get(), "Failed to get version");
}
