import { describe, expect, test } from "bun:test";
import type { PutObjectCommand } from "@aws-sdk/client-s3";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { createItemImages } from "./item-images";

const ID = mfcItemId(98_777) as MfcItemId;

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
    publicUrl: "https://cdn.example.test/",
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

describe("item pictures are stored by their bytes", () => {
  test.each(Object.entries(SAMPLES))(
    "%s bytes are stored with their own type",
    async (ext, sample) => {
      const { images, puts } = fakeBucket();

      const result = await images.store(ID, new Blob([sample], { type: "text/plain" }));

      expect(result).toEqual({
        kind: "stored",
        url: expect.stringMatching(
          new RegExp(`^https://cdn\\.example\\.test/items/mfc/98777/[0-9a-f]{16}\\.${ext}$`),
        ),
      });
      expect(puts).toHaveLength(1);
      expect(puts[0]).toMatchObject({
        Bucket: "pictures",
        Key: expect.stringMatching(new RegExp(`^items/mfc/98777/[0-9a-f]{16}\\.${ext}$`)),
        ContentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
        CacheControl: "public, max-age=31536000, immutable",
      });
    },
  );

  test("the key is the first 16 hex of the bytes' SHA-256", async () => {
    const { images } = fakeBucket();
    const digest = new Bun.CryptoHasher("sha256").update(SAMPLES.png).digest("hex").slice(0, 16);

    expect(await images.store(ID, new Blob([SAMPLES.png]))).toEqual({
      kind: "stored",
      url: `https://cdn.example.test/items/mfc/98777/${digest}.png`,
    });
  });

  test("the same bytes get the same key and different bytes another", async () => {
    const { images, puts } = fakeBucket();

    await images.store(ID, new Blob([SAMPLES.jpg]));
    await images.store(ID, new Blob([SAMPLES.jpg], { type: "image/png" }));
    await images.store(ID, new Blob([SAMPLES.jpg, new Uint8Array([1])]));

    const [first, second, third] = puts.map((put) => put.Key);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  test("bytes that are no supported image are rejected without a put", async () => {
    const { images, puts } = fakeBucket();

    for (const body of ["<!DOCTYPE html><html>", "%PDF-1.7", "", "RIFF\0\0\0\0WAVEfmt "]) {
      expect(await images.store(ID, new Blob([body], { type: "image/jpeg" }))).toEqual({
        kind: "rejected",
        reason: "not_an_image",
      });
    }
    expect(puts).toHaveLength(0);
  });

  test("a picture over 10 MB is rejected without a put", async () => {
    const { images, puts } = fakeBucket();
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.set(SAMPLES.jpg);

    expect(await images.store(ID, new Blob([oversized]))).toEqual({
      kind: "rejected",
      reason: "too_large",
    });
    expect(puts).toHaveLength(0);
  });

  test("a picture of exactly 10 MB is stored", async () => {
    const { images } = fakeBucket();
    const limit = new Uint8Array(10 * 1024 * 1024);
    limit.set(SAMPLES.jpg);

    expect(await images.store(ID, new Blob([limit]))).toMatchObject({ kind: "stored" });
  });
});
