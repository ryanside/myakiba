import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MAX_ITEM_PICTURE_BYTES } from "@myakiba/contracts/mfc-items/schema";
import { env } from "@myakiba/env/server";

type ReadPicture =
  | {
      readonly kind: "read";
      /** `items/<sha256>.<ext>`: the same bytes are one object, whoever stores them. */
      readonly key: string;
      readonly body: Uint8Array;
      readonly contentType: string;
    }
  | { readonly kind: "rejected"; readonly reason: "not_an_image" | "too_large" };

export type SavedPicture =
  /** In the bucket, and in the owner's picture ledger. */
  | { readonly kind: "stored"; readonly key: string }
  | {
      readonly kind: "rejected";
      readonly reason: "not_an_image" | "too_large" | "over_quota";
    };

export type PictureOutcome = "stored" | "absent" | "rejected" | "over_quota";

export type ItemImages = {
  /** Sniffs and hashes the picture. It stores nothing. */
  readonly read: (picture: Blob) => Promise<ReadPicture>;
  /** Stores a read picture at its key. Throws when S3 does not take it within 5 s. */
  readonly store: (picture: Extract<ReadPicture, { readonly kind: "read" }>) => Promise<void>;
};

type Bucket = {
  readonly client: {
    readonly send: (
      command: PutObjectCommand,
      options: { readonly abortSignal: AbortSignal },
    ) => Promise<{ readonly $metadata: object }>;
  };
  readonly name: string;
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
  return {
    async read(picture) {
      if (picture.size > MAX_ITEM_PICTURE_BYTES) return { kind: "rejected", reason: "too_large" };
      const body = new Uint8Array(await picture.arrayBuffer());
      const format = FORMATS.find((candidate) => candidate.matches(body));
      if (!format) return { kind: "rejected", reason: "not_an_image" };
      const hash = createHash("sha256").update(body).digest("hex");
      return {
        kind: "read",
        key: `items/${hash}.${format.extension}`,
        body,
        contentType: format.contentType,
      };
    },
    async store({ key, body, contentType }) {
      const timeout = AbortSignal.timeout(PUT_TIMEOUT_MS);
      const put = new PutObjectCommand({
        Bucket: bucket.name,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE,
      });
      await racingAbort(bucket.client.send(put, { abortSignal: timeout }), timeout);
    },
  };
}

export const itemImages = createItemImages({
  client: new S3Client({
    region: env.AWS_BUCKET_REGION,
    ...(env.S3_ENDPOINT_URL && { endpoint: env.S3_ENDPOINT_URL, forcePathStyle: true }),
  }),
  name: env.AWS_BUCKET_NAME,
});
