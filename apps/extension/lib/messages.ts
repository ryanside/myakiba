import { MAX_PICK_TITLE } from "@myakiba/contracts/add/constants";
import { itemPageHtmlSchema } from "@myakiba/contracts/mfc-items/schema";
import { mfcItemIdSchema, portPictureSchema } from "@myakiba/mfc/bridge";
import * as z from "zod";

/** What a click on Pick captured. The html is the page the server will parse, so it has the server's size limit. */
export const pickCaptureSchema = z.strictObject({
  mfcItemId: mfcItemIdSchema,
  title: z.string().max(MAX_PICK_TITLE).nullable(),
  html: itemPageHtmlSchema,
  picture: portPictureSchema.nullable(),
});

/** MFC content script → background. `mfc-hello` is the only message before a click and has no fields. */
export const fromMfcPageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("mfc-hello") }),
  z.strictObject({ type: z.literal("mfc-pick"), capture: pickCaptureSchema }),
  z.strictObject({ type: z.literal("mfc-unpick"), mfcItemId: mfcItemIdSchema }),
]);

/** The background's answer to each of them, for the sender's context and the Item at the sender's URL. */
export const mfcPageStateSchema = z.strictObject({
  picked: z.boolean(),
  count: z.number().int().nonnegative(),
  full: z.boolean(),
  refused: z.enum(["full", "storage_failed"]).nullable(),
});
