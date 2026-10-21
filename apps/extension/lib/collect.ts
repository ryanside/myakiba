import * as z from "zod";
import { mfcItemIdSchema } from "@myakiba/mfc/bridge";

export const PAGE_TIMEOUT_MS = 45_000;

export const collectRequestSchema = z.strictObject({
  mode: z.enum(["fetch", "document"]),
  mfcItemId: mfcItemIdSchema,
});
export type CollectRequest = z.output<typeof collectRequestSchema>;

declare global {
  /** The collector is a bundled file and takes no arguments, so the background leaves its request here. */
  var myakibaCollectRequest: CollectRequest | undefined;
}

export const collectedPageSchema = z.strictObject({
  status: z.number().int(),
  cfMitigated: z.string().nullable(),
  retryAfter: z.string().nullable(),
  html: z.string(),
  picture: z.strictObject({ base64: z.base64(), contentType: z.string() }).nullable(),
});
export type CollectedPage = z.output<typeof collectedPageSchema>;
