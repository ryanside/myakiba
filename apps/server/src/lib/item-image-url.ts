import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { env } from "@myakiba/env/server";

/** Where the bucket's pictures are served: `AWS_BUCKET_URL`, or the bucket's own S3 address. */
const PICTURE_BASE_URL = (
  env.AWS_BUCKET_URL ?? `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_BUCKET_REGION}.amazonaws.com`
).replace(/\/+$/u, "");

// A literal, not a bound value, so every use of the expression reads the same, as DISTINCT ON
// and ORDER BY need. The URL comes from the server's own config.
const BASE_LITERAL = sql.raw(`'${PICTURE_BASE_URL.replaceAll("'", "''")}/'`);

/**
 * The URL an Item's picture loads from, as SQL, for the `item` row named `alias` in a query. A
 * picture stored by its content has a key, and its URL is the bucket's public URL and the key; an
 * older picture kept its full URL in `image`. Every read builds the URL here, so none returns a key.
 */
export function itemImageSql(alias = "item"): SQL<string | null> {
  const row = sql.identifier(alias);
  return sql<
    string | null
  >`(CASE WHEN ${row}.image_key IS NULL THEN ${row}.image ELSE ${BASE_LITERAL} || ${row}.image_key END)`;
}
