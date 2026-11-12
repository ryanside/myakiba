import { MAX_PICK_TITLE } from "@myakiba/contracts/add/constants";
import { ITEM_FETCH_ERROR_CODES } from "@myakiba/contracts/mfc-items/fetch-errors";
import type { ItemFetchErrorCode } from "@myakiba/contracts/mfc-items/fetch-errors";
import { Result } from "better-result";
import type { SerializedResult, StandardSchemaV1 } from "better-result";
import * as z from "zod";
import { mfcItemId } from "./page";
import type { MfcItemId } from "./page";

export const BRIDGE_CHANNEL = "myakiba-mfc-bridge";
export const BRIDGE_PROTOCOL = 2;
export const MAX_ITEMS_PER_REQUEST = 1000;

const FETCH_STATES = ["queued", "fetching", "needs_user", "backing_off"] as const;
type FetchState = (typeof FETCH_STATES)[number];

const DONE_REASONS = ["complete", "cancelled", "interrupted"] as const;
type DoneReason = (typeof DONE_REASONS)[number];

export const mfcItemIdSchema = z.number().transform((value, ctx): MfcItemId => {
  const id = mfcItemId(value);
  if (id === null) {
    ctx.addIssue({ code: "custom", message: "an MFC item id is an integer from 1 to 2^31-1" });
    return z.NEVER;
  }
  return id;
});

const itemIdsSchema = z
  .array(mfcItemIdSchema)
  .min(1)
  .max(MAX_ITEMS_PER_REQUEST)
  .refine((ids) => new Set(ids).size === ids.length, "MFC item ids must be unique");

/**
 * The captures an acknowledgement settles. It names captures, not Items, so a late one never deletes a re-pick of the
 * same Item. The pick store is capped by size, not count, so it may name any number of them.
 */
const captureIdsSchema = z
  .array(z.uuid())
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, "capture ids must be unique");

export const bridgeRequestSchema = z.strictObject({
  channel: z.literal(BRIDGE_CHANNEL),
  protocol: z.literal(BRIDGE_PROTOCOL),
  requestId: z.uuid(),
  request: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("hello") }),
    z.strictObject({ type: z.literal("fetch-items"), mfcItemIds: itemIdsSchema }),
    z.strictObject({ type: z.literal("cancel"), targetRequestId: z.uuid() }),
    z.strictObject({ type: z.literal("take-picks") }),
    z.strictObject({ type: z.literal("picks-saved"), captureIds: captureIdsSchema }),
    z.strictObject({ type: z.literal("picks-discarded"), captureIds: captureIdsSchema }),
  ]),
});

/** An item the extension fetched: its page, and its picture when it could read one. */
export type ItemPage<Picture> = { readonly html: string; readonly picture: Picture | null };

/** Why the extension could not fetch an item. Only the code crosses the bridge. */
export type ItemFailure<Code extends string = ItemFetchErrorCode> = { readonly code: Code };

type StatusEvent = {
  readonly type: "status";
  readonly state: FetchState;
  readonly mfcItemId: MfcItemId | null;
  readonly untilMs: number | null;
};

type DoneEvent = { readonly type: "done"; readonly reason: DoneReason };

export type RunEvent<Picture> =
  | {
      readonly type: "item";
      readonly mfcItemId: MfcItemId;
      readonly result: Result<ItemPage<Picture>, ItemFailure>;
    }
  | StatusEvent
  | DoneEvent;

/** A run event as it crosses the bridge: an item's result is better-result's serialized envelope. */
type WireEvent<Picture> =
  | {
      readonly type: "item";
      readonly mfcItemId: MfcItemId;
      readonly result: SerializedResult<ItemPage<Picture>, ItemFailure>;
    }
  | StatusEvent
  | DoneEvent;

/** A pick as the extension keeps it: the Item page the user picked, scrubbed, and its picture. */
type PickedItem<Picture> = {
  /** Names this capture, which the page's acknowledgement settles. A re-pick of the Item is a new capture. */
  readonly captureId: string;
  readonly mfcItemId: MfcItemId;
  readonly title: string | null;
  readonly pickedAt: number;
  readonly html: string;
  readonly picture: Picture | null;
};

type PicksEvent<Picture> = {
  readonly type: "picks";
  readonly picks: readonly PickedItem<Picture>[];
};

type AnnounceEvent = {
  readonly type: "announce";
  readonly extensionVersion: string;
  readonly protocols: { readonly min: number; readonly max: number };
};

/** The picture as the page gets it: bytes the content script transfers rather than copies. */
export type BridgePicture = { readonly bytes: ArrayBuffer; readonly contentType: string };

export type BridgeEventMessage = {
  readonly channel: typeof BRIDGE_CHANNEL;
  readonly requestId: string | null;
  readonly event: AnnounceEvent | WireEvent<BridgePicture> | PicksEvent<BridgePicture>;
};

type SynchronousSchema<Input, Output> = {
  readonly "~standard": Omit<StandardSchemaV1.Props<Input, Output>, "validate"> & {
    readonly validate: (
      ...args: Parameters<StandardSchemaV1.Props["validate"]>
    ) => StandardSchemaV1.Result<Output>;
  };
};

/**
 * Zod types its Standard Schema validation as maybe async, so a codec built on it would answer maybe a Promise. These
 * schemas never are, and a synchronous codec relays each event in the order it came.
 */
function synchronous<Schema extends z.ZodType>(
  schema: Schema,
): SynchronousSchema<z.input<Schema>, z.output<Schema>> {
  return {
    "~standard": {
      version: 1,
      vendor: "zod",
      validate: (value) => {
        const parsed = schema.safeParse(value);
        return parsed.success ? { value: parsed.data } : { issues: parsed.error.issues };
      },
    },
  };
}

function leniently<const Values extends readonly [string, ...string[]]>(values: Values) {
  return z.union([z.enum(values), z.string().transform(() => "unknown" as const)]);
}

const itemFailureSchema = z.strictObject({ code: z.enum(ITEM_FETCH_ERROR_CODES) });

/** Chrome JSON-serializes runtime messages, so picture bytes cross the extension as base64. */
export const portPictureSchema = z.strictObject({ base64: z.base64(), contentType: z.string() });
export type PortPicture = Readonly<z.output<typeof portPictureSchema>>;

const portItemPageSchema = z.strictObject({
  html: z.string(),
  picture: portPictureSchema.nullable(),
});

const portItemPageToWire = synchronous(portItemPageSchema);
const portItemFailureToWire = synchronous(itemFailureSchema);
const portItemPageFromWire = synchronous(
  portItemPageSchema.transform(({ html, picture }): ItemPage<BridgePicture> => ({
    html,
    picture: picture && {
      bytes: Uint8Array.fromBase64(picture.base64).buffer,
      contentType: picture.contentType,
    },
  })),
);
const portItemFailureFromWire = synchronous(itemFailureSchema);

/**
 * An item's result between the background and the content script. One build holds both ends, so each side uses the
 * unsafe methods, and a result they disagree on is a defect.
 */
export const portItemCodec = Result.codec({
  serialize: { ok: portItemPageToWire, err: portItemFailureToWire },
  deserialize: { ok: portItemPageFromWire, err: portItemFailureFromWire },
});

const bridgePictureSchema = z.strictObject({
  bytes: z.instanceof(ArrayBuffer),
  contentType: z.string(),
});

const pageItemPageToWire = synchronous(
  z.strictObject({ html: z.string(), picture: bridgePictureSchema.nullable() }),
);
const pageItemFailureToWire = synchronous(itemFailureSchema);
const receivedPictureSchema = z.object({
  bytes: z.instanceof(ArrayBuffer),
  contentType: z.string(),
});

const pageItemPageFromWire = synchronous(
  z.object({ html: z.string(), picture: receivedPictureSchema.nullable() }),
);
const pageItemFailureFromWire = synchronous(z.object({ code: leniently(ITEM_FETCH_ERROR_CODES) }));

/**
 * An item's result between the content script and the web page, which the browser's store and the deploy release
 * apart. The page reads it with the safe methods and leniently: a newer extension's error code reads as "unknown".
 */
export const pageItemCodec = Result.codec({
  serialize: { ok: pageItemPageToWire, err: pageItemFailureToWire },
  deserialize: { ok: pageItemPageFromWire, err: pageItemFailureFromWire },
});

const receivedEventSchema = z.union([
  z.object({
    type: z.literal("announce"),
    extensionVersion: z.string(),
    protocols: z.object({ min: z.number().int(), max: z.number().int() }),
  }),
  z.object({ type: z.literal("item"), mfcItemId: mfcItemIdSchema, result: z.unknown() }),
  z.object({
    type: z.literal("status"),
    state: leniently(FETCH_STATES),
    mfcItemId: mfcItemIdSchema.nullable(),
    untilMs: z.number().nullable(),
  }),
  z.object({ type: z.literal("done"), reason: leniently(DONE_REASONS) }),
  z.object({
    type: z.literal("picks"),
    picks: z
      .array(
        z.object({
          captureId: z.string(),
          mfcItemId: mfcItemIdSchema,
          title: z.string().nullable(),
          pickedAt: z.number(),
          html: z.string(),
          picture: receivedPictureSchema.nullable(),
        }),
      )
      .readonly(),
  }),
  z.object({ type: z.string() }).transform(() => ({ type: "unknown" as const })),
]);

/**
 * Lenient, for the web page: a newer extension's event types and states read as "unknown". An item's result is left
 * for `pageItemCodec` to read.
 */
export const bridgeEventSchema = z.object({
  channel: z.literal(BRIDGE_CHANNEL),
  requestId: z.string().nullable(),
  event: receivedEventSchema,
});

export const portRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("fetch-items"),
    requestId: z.uuid(),
    mfcItemIds: itemIdsSchema,
  }),
  z.strictObject({ type: z.literal("cancel"), targetRequestId: z.uuid() }),
  z.strictObject({ type: z.literal("keepalive") }),
  z.strictObject({ type: z.literal("take-picks"), requestId: z.uuid() }),
  z.strictObject({
    type: z.literal("picks-saved"),
    requestId: z.uuid(),
    captureIds: captureIdsSchema,
  }),
  z.strictObject({
    type: z.literal("picks-discarded"),
    requestId: z.uuid(),
    captureIds: captureIdsSchema,
  }),
]);
export type PortRequest = z.output<typeof portRequestSchema>;

export const portEventSchema = z.strictObject({
  requestId: z.uuid(),
  event: z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("item"),
      mfcItemId: mfcItemIdSchema,
      result: z.discriminatedUnion("status", [
        z.strictObject({ status: z.literal("ok"), value: portItemPageSchema }),
        z.strictObject({ status: z.literal("error"), error: itemFailureSchema }),
      ]),
    }),
    z.strictObject({
      type: z.literal("status"),
      state: z.enum(FETCH_STATES),
      mfcItemId: mfcItemIdSchema.nullable(),
      untilMs: z.number().nullable(),
    }),
    z.strictObject({ type: z.literal("done"), reason: z.enum(DONE_REASONS) }),
    z.strictObject({
      type: z.literal("picks"),
      picks: z
        .array(
          z.strictObject({
            captureId: z.uuid(),
            mfcItemId: mfcItemIdSchema,
            title: z.string().max(MAX_PICK_TITLE).nullable(),
            pickedAt: z.number().int(),
            html: z.string(),
            picture: portPictureSchema.nullable(),
          }),
        )
        .readonly(),
    }),
  ]),
});
export type PortEvent = {
  readonly requestId: string;
  readonly event: WireEvent<PortPicture> | PicksEvent<PortPicture>;
};
