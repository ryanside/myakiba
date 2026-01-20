import { app, getErrorMessage } from "@/lib/treaty-client";

export async function joinWaitlist(data: {
  email: string;
  turnstileToken: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const { data: responseData, error } = await app.api.waitlist.post(data);

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to join waitlist"));
  }

  return responseData;
}

export async function verifyEarlyAccess(
  password: string
): Promise<{ success: boolean; error?: string }> {
  const { data: responseData, error } = await app.api.waitlist["verify-access"].post({ password });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to verify early access"));
  }

  return responseData;
}
