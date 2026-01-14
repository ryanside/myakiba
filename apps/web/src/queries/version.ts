import type { InferResponseType } from "hono/client";
import { client } from "@/lib/hono-client";

const $get = client.api.version.$get;
export type VersionResponse = InferResponseType<typeof $get>;

export async function getVersion(): Promise<VersionResponse> {
  const res = await $get();
  if (!res.ok) throw new Error("Failed to fetch version");
  return res.json();
}
