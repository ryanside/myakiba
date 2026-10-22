import * as z from "zod";
import { mfcItemId } from "./page";
import type { MfcItemId } from "./page";

export const BRIDGE_CHANNEL = "myakiba-mfc-bridge";
export const BRIDGE_PROTOCOL = 1;
export const MAX_ITEMS_PER_REQUEST = 1000;

export const ITEM_ERRORS = [
  "mfc_signed_out",
  "hidden_or_missing",
  "challenge_unsolved",
  "rate_limited",
  "timeout",
  "unexpected_page",
] as const;
export type ItemError = (typeof ITEM_ERRORS)[number];

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

export const bridgeRequestSchema = z.strictObject({
  channel: z.literal(BRIDGE_CHANNEL),
  protocol: z.literal(BRIDGE_PROTOCOL),
  requestId: z.uuid(),
  request: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("hello") }),
    z.strictObject({ type: z.literal("fetch-items"), mfcItemIds: itemIdsSchema }),
    z.strictObject({ type: z.literal("cancel"), targetRequestId: z.uuid() }),
  ]),
});

export type ItemResult<Picture> =
  | { readonly ok: true; readonly html: string; readonly picture: Picture | null }
  | { readonly ok: false; readonly error: ItemError };

export type RunEvent<Picture> =
  | { readonly type: "item"; readonly mfcItemId: MfcItemId; readonly result: ItemResult<Picture> }
  | {
      readonly type: "status";
      readonly state: FetchState;
      readonly mfcItemId: MfcItemId | null;
      readonly untilMs: number | null;
    }
  | { readonly type: "done"; readonly reason: DoneReason };

type AnnounceEvent = {
  readonly type: "announce";
  readonly extensionVersion: string;
  readonly protocols: { readonly min: number; readonly max: number };
};

type BridgePicture = { readonly bytes: ArrayBuffer; readonly contentType: string };

export type BridgeEventMessage = {
  readonly channel: typeof BRIDGE_CHANNEL;
  readonly requestId: string | null;
  readonly event: AnnounceEvent | RunEvent<BridgePicture>;
};

function leniently<const Values extends readonly [string, ...string[]]>(values: Values) {
  return z.union([z.enum(values), z.string().transform(() => "unknown" as const)]);
}

const receivedEventSchema = z.union([
  z.object({
    type: z.literal("announce"),
    extensionVersion: z.string(),
    protocols: z.object({ min: z.number().int(), max: z.number().int() }),
  }),
  z.object({
    type: z.literal("item"),
    mfcItemId: mfcItemIdSchema,
    result: z.discriminatedUnion("ok", [
      z.object({
        ok: z.literal(true),
        html: z.string(),
        picture: z.object({ bytes: z.instanceof(ArrayBuffer), contentType: z.string() }).nullable(),
      }),
      z.object({ ok: z.literal(false), error: leniently(ITEM_ERRORS) }),
    ]),
  }),
  z.object({
    type: z.literal("status"),
    state: leniently(FETCH_STATES),
    mfcItemId: mfcItemIdSchema.nullable(),
    untilMs: z.number().nullable(),
  }),
  z.object({ type: z.literal("done"), reason: leniently(DONE_REASONS) }),
  z.object({ type: z.string() }).transform(() => ({ type: "unknown" as const })),
]);

/** Lenient, for the web page: a newer extension's event types and codes read as "unknown". */
export const bridgeEventSchema = z.object({
  channel: z.literal(BRIDGE_CHANNEL),
  requestId: z.string().nullable(),
  event: receivedEventSchema,
});

/** Chrome JSON-serializes runtime messages, so picture bytes cross the extension as base64. */
export const portPictureSchema = z.strictObject({ base64: z.base64(), contentType: z.string() });
export type PortPicture = Readonly<z.output<typeof portPictureSchema>>;

export const portRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("fetch-items"),
    requestId: z.uuid(),
    mfcItemIds: itemIdsSchema,
  }),
  z.strictObject({ type: z.literal("cancel"), targetRequestId: z.uuid() }),
  z.strictObject({ type: z.literal("keepalive") }),
]);
export type PortRequest = z.output<typeof portRequestSchema>;

export const portEventSchema = z.strictObject({
  requestId: z.uuid(),
  event: z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("item"),
      mfcItemId: mfcItemIdSchema,
      result: z.discriminatedUnion("ok", [
        z.strictObject({
          ok: z.literal(true),
          html: z.string(),
          picture: portPictureSchema.nullable(),
        }),
        z.strictObject({ ok: z.literal(false), error: z.enum(ITEM_ERRORS) }),
      ]),
    }),
    z.strictObject({
      type: z.literal("status"),
      state: z.enum(FETCH_STATES),
      mfcItemId: mfcItemIdSchema.nullable(),
      untilMs: z.number().nullable(),
    }),
    z.strictObject({ type: z.literal("done"), reason: z.enum(DONE_REASONS) }),
  ]),
});
export type PortEvent = { readonly requestId: string; readonly event: RunEvent<PortPicture> };
