import { mfcItemIdSchema, portPictureSchema } from "@myakiba/mfc/bridge";
import { Panic, Result, ResultDeserializationError, panic } from "better-result";
import type { ResultCodec, StandardSchemaOutput, StandardSchemaV1 } from "better-result";
import * as z from "zod";
import type { AttemptAbandoned } from "./errors/attempt-abandoned";
import { CollectorAnswerInvalid } from "./errors/collector-answer-invalid";
import type { CollectorInjectionFailed } from "./errors/collector-injection-failed";
import { MfcPageFetchFailed } from "./errors/mfc-page-fetch-failed";
import { PictureFetchFailed } from "./errors/picture-fetch-failed";
import { PictureRejected } from "./errors/picture-rejected";
import { PictureTimedOut } from "./errors/picture-timed-out";

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
  z.strictObject({ kind: z.literal("public-picture"), url: z.string() }),
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

/**
 * Runs the request the background armed. A script that rejects reaches the background only as undefined, so a defect in
 * the work for any request answers as a defect report instead.
 */
export async function runArmed<T>(
  work: (request: CollectRequest, signal: AbortSignal) => Promise<T>,
): Promise<T | CollectorDefect> {
  const request = collectRequestSchema.parse(globalThis.myakibaCollectRequest);
  globalThis.myakibaCollectRequest = undefined;
  const controller = globalThis.myakibaCollectAbort ?? new AbortController();
  try {
    return await work(request, controller.signal);
  } catch (error) {
    return reportDefect(error);
  } finally {
    if (globalThis.myakibaCollectAbort === controller) globalThis.myakibaCollectAbort = undefined;
  }
}

export const NO_STATUS = 0;

const collectedPageSchema = z.strictObject({
  status: z.number().int(),
  cfMitigated: z.string().nullable(),
  retryAfter: z.string().nullable(),
  html: z.string(),
});
export type CollectedPage = z.output<typeof collectedPageSchema>;

const errorSummarySchema = z.strictObject({ name: z.string(), message: z.string() });

const pageFetchFailedWireSchema = z.strictObject({
  _tag: z.literal("MfcPageFetchFailed"),
  mfcItemId: mfcItemIdSchema,
  cause: errorSummarySchema,
});

/** The collector's answer to a page request. Its only error is the in-tab fetch failing. */
export const pageAnswerCodec = Result.codec({
  serialize: {
    ok: collectedPageSchema,
    err: z
      .instanceof(MfcPageFetchFailed)
      .transform(({ _tag, mfcItemId, cause }) => ({ _tag, mfcItemId, cause })),
  },
  deserialize: {
    ok: collectedPageSchema,
    err: pageFetchFailedWireSchema.transform(
      ({ mfcItemId, cause }) => new MfcPageFetchFailed({ mfcItemId, cause }),
    ),
  },
});

/** How the collector fails to read a picture in the tab. */
export type PictureFailure = PictureRejected | PictureFetchFailed | PictureTimedOut;

const pictureFailureWireSchema = z.union([
  z
    .strictObject({
      _tag: z.literal("PictureRejected"),
      reason: z.enum(["http_status", "no_body", "too_large", "unknown_format"]),
      status: z.number().int(),
      bytes: z.number().int().nullable(),
    })
    .transform(({ reason, status, bytes }) => new PictureRejected({ reason, status, bytes })),
  z
    .strictObject({ _tag: z.literal("PictureFetchFailed"), cause: errorSummarySchema })
    .transform(({ cause }) => new PictureFetchFailed({ cause })),
  z
    .strictObject({ _tag: z.literal("PictureTimedOut"), timeoutMs: z.number() })
    .transform(({ timeoutMs }) => new PictureTimedOut({ timeoutMs })),
]);

/**
 * The collector's answer to a picture request. No picture means the tab does not show the picture asked for, which is
 * not a failure.
 */
export const pictureAnswerCodec = Result.codec({
  serialize: {
    ok: portPictureSchema.nullable(),
    err: z.union([
      z
        .instanceof(PictureRejected)
        .transform(({ _tag, reason, status, bytes }) => ({ _tag, reason, status, bytes })),
      z.instanceof(PictureFetchFailed).transform(({ _tag, cause }) => ({ _tag, cause })),
      z.instanceof(PictureTimedOut).transform(({ _tag, timeoutMs }) => ({ _tag, timeoutMs })),
    ]),
  },
  deserialize: { ok: portPictureSchema.nullable(), err: pictureFailureWireSchema },
});

const collectorDefectSchema = z.strictObject({
  defect: z.strictObject({ name: z.string(), message: z.string(), stack: z.string().nullable() }),
});

/**
 * What the collector answers for a defect in the tab, in place of a Result. A Panic cannot cross to the background, so
 * it crosses as this, and `readAnswer` panics with it there.
 */
export type CollectorDefect = z.output<typeof collectorDefectSchema>;

export function reportDefect(cause: unknown): CollectorDefect {
  // better-result wraps a Panic thrown in one of its callbacks, such as a catch handler that rethrows it, in a Panic of
  // its own. The innermost Panic names what broke.
  let defect = cause;
  while (Panic.is(defect) && Panic.is(defect.cause)) defect = defect.cause;
  return {
    defect:
      defect instanceof Error
        ? { name: defect.name, message: defect.message, stack: defect.stack ?? null }
        : { name: "thrown value", message: String(defect), stack: null },
  };
}

/** How the collector fails to answer any request. An aborted run answers AttemptAbandoned rather than throw. */
export type CollectorFailure = CollectorInjectionFailed | CollectorAnswerInvalid | AttemptAbandoned;

/** How the collector fails to answer a page request. */
export type PageCollectFailure = CollectorFailure | MfcPageFetchFailed;

export type AnswerCodec<Ok extends StandardSchemaV1, Fails extends StandardSchemaV1> = Pick<
  ResultCodec<StandardSchemaV1, StandardSchemaV1, Ok, Fails>,
  "deserialize"
>;

/** What the browser reports for the collector's run in one frame. */
type CollectorInjection = { readonly result?: unknown };

/**
 * A script that failed in the tab answers undefined, which no codec accepts, so it reads as an invalid answer. A defect
 * the collector reported panics here, so it reaches the item's supervisor as a defect.
 */
export async function readAnswer<Ok extends StandardSchemaV1, Fails extends StandardSchemaV1>(
  codec: AnswerCodec<Ok, Fails>,
  injection: CollectorInjection | undefined,
  tabId: number,
  kind: CollectRequest["kind"],
): Promise<Result<StandardSchemaOutput<Ok>, StandardSchemaOutput<Fails> | CollectorAnswerInvalid>> {
  const reported = collectorDefectSchema.safeParse(injection?.result);
  if (reported.success) {
    const { name, message, stack } = reported.data.defect;
    const cause = new Error(message);
    cause.name = name;
    if (stack !== null) cause.stack = stack;
    panic(`The collector's ${kind} run in tab ${tabId} hit a defect: ${name}: ${message}`, cause);
  }
  const decoded = await codec.deserialize(injection?.result);
  return decoded.mapError((failure) =>
    ResultDeserializationError.is(failure)
      ? new CollectorAnswerInvalid({ tabId, kind, issues: failure.issues ?? [] })
      : failure,
  );
}
