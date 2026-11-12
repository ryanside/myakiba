import { call } from "@/data/api";
import { app } from "@/lib/treaty-client";

export function getAccountType() {
  return call(app.api.settings["account-type"].get(), {
    fallback: "Failed to get account type",
    empty: "Failed to get account type",
  });
}
