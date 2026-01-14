import { client } from "@/lib/hono-client";

export async function joinWaitlist(data: {
  email: string;
  turnstileToken: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await client.api.waitlist.$post({
    json: data,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function verifyEarlyAccess(
  password: string
): Promise<{ success: boolean; error?: string }> {
  const response = await client.api.waitlist["verify-access"].$post({
    json: { password },
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Verification failed");
  }

  return data;
}
