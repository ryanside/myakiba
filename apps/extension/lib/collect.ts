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

/**
 * Chrome injects this as source text, so it cannot use module scope. Chrome can run a later func injection,
 * such as the stop, before it has read the collector file.
 */
export function armCollector(request: CollectRequest): void {
  globalThis.myakibaCollectRequest = request;
  globalThis.myakibaCollectAbort = new AbortController();
}

/** Chrome injects this as source text, so it cannot use module scope. */
export function stopCollector(): void {
  globalThis.myakibaCollectAbort?.abort();
}

export async function runArmed<T>(
  work: (request: CollectRequest, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const request = collectRequestSchema.parse(globalThis.myakibaCollectRequest);
  globalThis.myakibaCollectRequest = undefined;
  const controller = globalThis.myakibaCollectAbort ?? new AbortController();
  try {
    return await work(request, controller.signal);
  } finally {
    if (globalThis.myakibaCollectAbort === controller) globalThis.myakibaCollectAbort = undefined;
  }
}

export const NO_STATUS = 0;

export const collectedPageSchema = z.strictObject({
  status: z.number().int(),
  cfMitigated: z.string().nullable(),
  retryAfter: z.string().nullable(),
  html: z.string(),
});
export type CollectedPage = z.output<typeof collectedPageSchema>;
