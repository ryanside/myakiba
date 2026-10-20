import { app, getUserErrorMessage } from "@/lib/treaty-client";

export async function getAccountType() {
  const { data, error } = await app.api.settings["account-type"].get();
  if (error) {
    throw new Error(getUserErrorMessage(error, "Failed to get account type"));
  }
  return data;
}
