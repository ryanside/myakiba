import { describe, expect, test } from "bun:test";
import { S3Client } from "@aws-sdk/client-s3";
import type { PutObjectCommand } from "@aws-sdk/client-s3";
import { createItemImages } from "./item-images";

const sha256 = (data: Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");

function fakeBucket() {
  const puts: PutObjectCommand["input"][] = [];
  const images = createItemImages({
    client: {
      send: async (command) => {
        puts.push(command.input);
        return { $metadata: { httpStatusCode: 200 } };
      },
    },
    name: "pictures",
  });
  return { images, puts };
}

const ascii = (text: string) => [...new TextEncoder().encode(text)];

const bytes = (...parts: readonly (readonly number[])[]) => new Uint8Array(parts.flat());

const SAMPLES = {
  jpg: bytes([0xff, 0xd8, 0xff, 0xe0], ascii("JFIF")),
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ascii("IHDR")),
  gif: bytes(ascii("GIF89a"), [1, 0, 1, 0]),
  webp: bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBPVP8 ")),
  avif: bytes([0, 0, 0, 0x1c], ascii("ftypavif"), [0, 0, 0, 0]),
} as const;

describe("a picture is read by its bytes, and stores nothing until asked", () => {
  test.each(Object.entries(SAMPLES))(
    "%s bytes are keyed by their content with their own type",
    async (ext, sample) => {
      const { images, puts } = fakeBucket();

      const read = await images.read(new Blob([sample], { type: "text/plain" }));

      expect(read).toEqual({
        kind: "read",
        key: `items/${sha256(sample)}.${ext}`,
        body: sample,
        contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
      });
      expect(puts).toHaveLength(0);
    },
  );

  test("the same bytes get the same key, whatever the upload says its type is", async () => {
    const { images } = fakeBucket();

    const first = await images.read(new Blob([SAMPLES.jpg]));
    const second = await images.read(new Blob([SAMPLES.jpg], { type: "image/png" }));
    const other = await images.read(new Blob([SAMPLES.jpg, new Uint8Array([1])]));

    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
  });

  test("bytes that are no supported image are rejected", async () => {
    const { images } = fakeBucket();

    for (const body of ["<!DOCTYPE html><html>", "%PDF-1.7", "", "RIFF\0\0\0\0WAVEfmt "]) {
      expect(await images.read(new Blob([body], { type: "image/jpeg" }))).toEqual({
        kind: "rejected",
        reason: "not_an_image",
      });
    }
  });

  test("a picture over 10 MB is rejected, and one of exactly 10 MB is read", async () => {
    const { images } = fakeBucket();
    const limit = new Uint8Array(10 * 1024 * 1024);
    limit.set(SAMPLES.jpg);
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.set(SAMPLES.jpg);

    expect(await images.read(new Blob([oversized]))).toEqual({
      kind: "rejected",
      reason: "too_large",
    });
    expect(await images.read(new Blob([limit]))).toMatchObject({ kind: "read" });
  });
});

test("storing a read picture puts it at its key, public and immutable, with its type", async () => {
  const { images, puts } = fakeBucket();
  const read = await images.read(new Blob([SAMPLES.png]));
  if (read.kind !== "read") throw new Error("expected a read picture");

  await images.store(read);

  expect(puts).toEqual([
    {
      Bucket: "pictures",
      Key: `items/${sha256(SAMPLES.png)}.png`,
      Body: SAMPLES.png,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
      IfNoneMatch: "*",
    },
  ]);
});

const s3Url = process.env.TEST_S3_URL ? new URL(process.env.TEST_S3_URL) : null;
if (s3Url === null && process.env.CI) {
  throw new Error("TEST_S3_URL is required in CI, so pictures are stored against MinIO");
}

describe.skipIf(s3Url === null)("storing against an S3-compatible store", () => {
  const url = s3Url ?? new URL("http://unused");
  const credentials = {
    accessKeyId: decodeURIComponent(url.username),
    secretAccessKey: decodeURIComponent(url.password),
  };
  const bucket = url.pathname.slice(1);
  const images = createItemImages({
    client: new S3Client({
      region: "us-east-1",
      endpoint: url.origin,
      forcePathStyle: true,
      credentials,
    }),
    name: bucket,
  });
  const objects = new Bun.S3Client({ ...credentials, bucket, endpoint: url.origin });

  test("an object already at the key is never overwritten, and a missing one is stored again", async () => {
    const read = await images.read(new Blob([SAMPLES.png]));
    if (read.kind !== "read") throw new Error("expected a read picture");
    const first = { ...read, key: `test/${crypto.randomUUID()}.png` };

    await images.store(first);
    await images.store({ ...first, body: SAMPLES.jpg, contentType: "image/jpeg" });
    expect(await objects.file(first.key).bytes()).toEqual(SAMPLES.png);

    await objects.delete(first.key);
    await images.store(first);
    expect(await objects.file(first.key).bytes()).toEqual(SAMPLES.png);
  });
});
