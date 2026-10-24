import { call, rejectErr } from "@/data/api";
import { app } from "@/lib/treaty-client";

export async function getAccountType() {
  return call(app.api.settings["account-type"].get(), {
    fallback: "Failed to get account type",
  }).then(rejectErr);
}
