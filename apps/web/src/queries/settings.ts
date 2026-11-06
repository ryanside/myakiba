import { readResponse } from "@/lib/read-response";
import { app } from "@/lib/treaty-client";

export async function getAccountType() {
  return readResponse(app.api.settings["account-type"].get(), "Failed to get account type");
}
