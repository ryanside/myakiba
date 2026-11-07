import { requireData } from "@/lib/api-response";
import { app } from "@/lib/treaty-client";

export async function getAccountType() {
  return requireData(app.api.settings["account-type"].get(), "Failed to get account type");
}
