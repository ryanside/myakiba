import { sql } from "drizzle-orm";
import { itemImageSql } from "@/lib/item-image-url";

// Order thumbnails mirror the default Order Items table order. When images repeat,
// DISTINCT ON keeps the newest collection row before the preview is assembled.
const orderItemImage = itemImageSql("order_item");

export const orderPreviewImagesSql = sql<string[]>`ARRAY(
  SELECT first_image.image
  FROM (
    SELECT DISTINCT ON (${orderItemImage})
      ${orderItemImage} AS image,
      order_collection.created_at,
      order_collection.id AS sort_key
    FROM "collection" order_collection
    INNER JOIN item order_item ON order_item.id = order_collection.item_id
    WHERE order_collection.order_id = "order".id
      AND ${orderItemImage} IS NOT NULL
    ORDER BY ${orderItemImage}, order_collection.created_at DESC, order_collection.id DESC
  ) first_image
  ORDER BY first_image.created_at DESC, first_image.sort_key DESC
)`;

export const orderPreviewItemIdsSql = sql<string[]>`ARRAY(
  SELECT first_item.item_id
  FROM (
    SELECT DISTINCT ON (order_item.id)
      order_item.id AS item_id,
      order_collection.created_at,
      order_collection.id AS sort_key
    FROM "collection" order_collection
    INNER JOIN item order_item ON order_item.id = order_collection.item_id
    WHERE order_collection.order_id = "order".id
    ORDER BY order_item.id, order_collection.created_at DESC, order_collection.id DESC
  ) first_item
  ORDER BY first_item.created_at DESC, first_item.sort_key DESC
)`;
