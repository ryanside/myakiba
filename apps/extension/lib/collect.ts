import * as z from "zod";
import { mfcItemIdSchema } from "@myakiba/mfc/bridge";

export const PAGE_TIMEOUT_MS = 45_000;

const pageRequestSchema = z.strictObject({
  kind: z.literal("page"),
  mode: z.enum(["fetch", "document"]),
  mfcItemId: mfcItemIdSchema,
});
export type PageRequest = z.output<typeof pageRequestSchema>;

const collectRequestSchema = z.discriminatedUnion("kind", [
  pageRequestSchema,
  z.strictObject({ kind: z.literal("gated-picture"), url: z.string() }),
]);
export type CollectRequest = z.output<typeof collectRequestSchema>;

declare global {
  /** The collector is a bundled file and takes no arguments, so the background leaves its request here. */
  var myakibaCollectRequest: CollectRequest | undefined;
  /** Stops the running collector's MFC fetch, so a cancelled load ends in the tab too. */
  var myakibaCollectAbort: AbortController | undefined;
}

/** Injected as a `func` before the collector file, so the collector finds its request. */
export function armCollector(request: CollectRequest): void {
  globalThis.myakibaCollectRequest = request;
}

/** Injected as a `func` once the load is cancelled. */
export function stopCollector(): void {
  globalThis.myakibaCollectAbort?.abort();
}

/** The collector's side: runs `work` on the request the background left, with a signal a stop aborts. */
export async function runArmed<T>(
  work: (request: CollectRequest, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const request = collectRequestSchema.parse(globalThis.myakibaCollectRequest);
  globalThis.myakibaCollectRequest = undefined;
  const controller = new AbortController();
  globalThis.myakibaCollectAbort = controller;
  return work(request, controller.signal);
}

export const collectedPageSchema = z.strictObject({
  status: z.number().int(),
  cfMitigated: z.string().nullable(),
  retryAfter: z.string().nullable(),
  html: z.string(),
});
export type CollectedPage = z.output<typeof collectedPageSchema>;
