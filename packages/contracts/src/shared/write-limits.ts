import * as z from "zod";

/**
 * The longest text and list a client may write. Each sits far above real use, so it only stops an
 * abusive body. The Add page keeps its own tighter notes and tags caps.
 */
export const WRITE_LIMITS = {
  /** The Add page names a new Order after its first Item, so this sits far above Item titles. */
  title: 1000,
  shop: 200,
  notes: 10_000,
  tag: 100,
  tags: 100,
  label: 200,
  id: 64,
  ids: 1000,
  name: 100,
  imageUrl: 2048,
} as const;

export const idListSchema = z.array(z.string().max(WRITE_LIMITS.id)).max(WRITE_LIMITS.ids);
