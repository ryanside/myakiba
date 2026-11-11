import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { MAX_ITEM_PICTURE_BYTES } from "@myakiba/contracts/mfc-items/schema";
import { env } from "@myakiba/env/server";

/** A picture read from an upload, before an Item shows it. */
export type StoredPicture =
  /** In the bucket at its content's key. No Item shows it until the writer saves it. */
  | { readonly kind: "stored"; readonly url: string; readonly bytes: number }
  | {
      readonly kind: "rejected";
      readonly reason: "not_an_image" | "too_large" | "over_quota";
    };

/** What a save answers about the picture it was sent. */
export type PictureOutcome = "stored" | "absent" | "rejected" | "over_quota";

/** Whether the owner can store `bytes` more for the picture at `url`, counting one they show once. */
type Fits = (url: string, bytes: number) => Promise<boolean>;

export type ItemImages = {
  /** Sniffs and hashes the picture, then stores it if it fits. Throws when S3 does not take it within 5 s. */
  readonly store: (picture: Blob, fits: Fits) => Promise<StoredPicture>;
};

type Bucket = {
  readonly client: {
    readonly send: (
      command: PutObjectCommand,
      options: { readonly abortSignal: AbortSignal },
    ) => Promise<PutObjectCommandOutput>;
  };
  readonly name: string;
  readonly publicUrl: string;
};

const IMMUTABLE = "public, max-age=31536000, immutable";
const PUT_TIMEOUT_MS = 5000;

function racingAbort<T>(put: Promise<T>, signal: AbortSignal): Promise<T> {
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  return Promise.race([put, aborted]);
}

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
    async store(picture, fits) {
      if (picture.size > MAX_ITEM_PICTURE_BYTES) return { kind: "rejected", reason: "too_large" };
      const bytes = new Uint8Array(await picture.arrayBuffer());
      const format = FORMATS.find((candidate) => candidate.matches(bytes));
      if (!format) return { kind: "rejected", reason: "not_an_image" };
      // The same bytes are one object and one CDN entry, whoever stores them and for which Item.
      const contentHash = createHash("sha256").update(bytes).digest("hex");
      const contentKey = `items/${contentHash}.${format.extension}`;
      const url = `${baseUrl}/${contentKey}`;
      if (!(await fits(url, bytes.byteLength))) return { kind: "rejected", reason: "over_quota" };
      const timeout = AbortSignal.timeout(PUT_TIMEOUT_MS);
      const put = new PutObjectCommand({
        Bucket: bucket.name,
        Key: contentKey,
        Body: bytes,
        ContentType: format.contentType,
        CacheControl: IMMUTABLE,
      });
      // Stored again even when it exists, so its LastModified starts the reconcile grace anew.
      await racingAbort(bucket.client.send(put, { abortSignal: timeout }), timeout);
      return { kind: "stored", url, bytes: bytes.byteLength };
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
