import * as z from "zod";

/**
 * The longest text and list a client may write. Each sits far above real use, so it only stops a
 * body built to bloat the rows every list read loads. The Add page keeps its own tighter caps.
 */
export const WRITE_LIMITS = {
  /** An Order or List title. The Add page names a new Order after its first Item, and a Pick's title stops at 300. */
  title: 1000,
  /** A shop name, as the Add page caps it. */
  shop: 200,
  /** Order and Collection Item notes, and a List description: twice the Add page's 5000. */
  notes: 10_000,
  /** One tag, and the tags on one Collection Item: five times the Add page's 20 of 50. */
  tag: 100,
  tags: 100,
  /** A short code or label, such as a release's currency, barcode or type, or a score. */
  label: 200,
  /** An id: cuid2 and uuid ids are 24 to 36 characters; the Add page caps Item ids at 64. */
  id: 64,
  /** The ids in one bulk request. A table page shows at most 100 rows. */
  ids: 1000,
  /** An account's display name. The web app never sets one longer than a 30-character username. */
  name: 100,
  /** An account's picture URL: 2048 is the URL length browsers and CDNs reliably carry. */
  imageUrl: 2048,
} as const;

/** The ids of one bulk request. */
export const idListSchema = z.array(z.string().max(WRITE_LIMITS.id)).max(WRITE_LIMITS.ids);
