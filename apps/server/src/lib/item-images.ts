import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { MAX_ITEM_PICTURE_BYTES } from "@myakiba/contracts/mfc-items/schema";
import { env } from "@myakiba/env/server";
import type { MfcItemId } from "@myakiba/mfc/page";

type StoredPicture =
  | { readonly kind: "stored"; readonly url: string }
  | { readonly kind: "rejected"; readonly reason: "not_an_image" | "too_large" };

export type ItemImages = {
  readonly store: (mfcItemId: MfcItemId, picture: Blob) => Promise<StoredPicture>;
};

type Bucket = {
  readonly client: {
    readonly send: (command: PutObjectCommand) => Promise<PutObjectCommandOutput>;
  };
  readonly name: string;
  readonly publicUrl: string;
};

const IMMUTABLE = "public, max-age=31536000, immutable";

const ascii = (text: string) => [...new TextEncoder().encode(text)];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const FORMATS = [
  {
    extension: "jpg",
    contentType: "image/jpeg",
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    extension: "png",
    contentType: "image/png",
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    extension: "gif",
    contentType: "image/gif",
    matches: (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")),
  },
  {
    extension: "webp",
    contentType: "image/webp",
    matches: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8),
  },
  {
    extension: "avif",
    contentType: "image/avif",
    matches: (b) =>
      startsWith(b, ascii("ftyp"), 4) &&
      (startsWith(b, ascii("avif"), 8) || startsWith(b, ascii("avis"), 8)),
  },
] as const satisfies readonly {
  readonly extension: string;
  readonly contentType: string;
  readonly matches: (bytes: Uint8Array) => boolean;
}[];

export function createItemImages(bucket: Bucket): ItemImages {
  const baseUrl = bucket.publicUrl.replace(/\/+$/u, "");
  return {
    async store(mfcItemId, picture) {
      if (picture.size > MAX_ITEM_PICTURE_BYTES) return { kind: "rejected", reason: "too_large" };
      const bytes = new Uint8Array(await picture.arrayBuffer());
      const format = FORMATS.find((candidate) => candidate.matches(bytes));
      if (!format) return { kind: "rejected", reason: "not_an_image" };
      const contentHash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
      const contentKey = `items/mfc/${mfcItemId}/${contentHash}.${format.extension}`;
      await bucket.client.send(
        new PutObjectCommand({
          Bucket: bucket.name,
          Key: contentKey,
          Body: bytes,
          ContentType: format.contentType,
          CacheControl: IMMUTABLE,
        }),
      );
      return { kind: "stored", url: `${baseUrl}/${contentKey}` };
    },
  };
}

export const itemImages = createItemImages({
  client: new S3Client({
    region: env.AWS_BUCKET_REGION,
    ...(env.S3_ENDPOINT_URL && { endpoint: env.S3_ENDPOINT_URL, forcePathStyle: true }),
  }),
  name: env.AWS_BUCKET_NAME,
  publicUrl:
    env.AWS_BUCKET_URL ??
    `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_BUCKET_REGION}.amazonaws.com`,
});
