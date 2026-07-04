import { app, getErrorMessage } from "@/lib/treaty-client";

export async function getAccountType() {
  const { data, error } = await app.api.settings["account-type"].get();
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to get account type"));
  }
  return data;
}
