import { describe, expect, test } from "bun:test";
import type { PutObjectCommand } from "@aws-sdk/client-s3";
import { createItemImages } from "./item-images";

const fits = async () => true;
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
    "%s bytes are stored with their own type at their content's key",
    async (ext, sample) => {
      const { images, puts } = fakeBucket();

      const result = await images.store(new Blob([sample], { type: "text/plain" }), fits);

      const key = `items/${sha256(sample)}.${ext}`;
      expect(result).toEqual({
        kind: "stored",
        url: `https://cdn.example.test/${key}`,
        bytes: sample.byteLength,
      });
      expect(puts).toHaveLength(1);
      expect(puts[0]).toMatchObject({
        Bucket: "pictures",
        Key: key,
        ContentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
        CacheControl: "public, max-age=31536000, immutable",
      });
    },
  );

  test("the same bytes get the same key, stored again each time, and different bytes another", async () => {
    const { images, puts } = fakeBucket();

    await images.store(new Blob([SAMPLES.jpg]), fits);
    await images.store(new Blob([SAMPLES.jpg], { type: "image/png" }), fits);
    await images.store(new Blob([SAMPLES.jpg, new Uint8Array([1])]), fits);

    const [first, second, third] = puts.map((put) => put.Key);
    expect(first).toBe(`items/${sha256(SAMPLES.jpg)}.jpg`);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  test("a picture that does not fit the owner's quota is rejected without a put", async () => {
    const { images, puts } = fakeBucket();
    const asked: [string, number][] = [];

    const result = await images.store(new Blob([SAMPLES.png]), async (...args) => {
      asked.push(args);
      return false;
    });

    expect(result).toEqual({ kind: "rejected", reason: "over_quota" });
    expect(asked).toEqual([
      [`https://cdn.example.test/items/${sha256(SAMPLES.png)}.png`, SAMPLES.png.byteLength],
    ]);
    expect(puts).toHaveLength(0);
  });

  test("bytes that are no supported image are rejected without a put", async () => {
    const { images, puts } = fakeBucket();

    for (const body of ["<!DOCTYPE html><html>", "%PDF-1.7", "", "RIFF\0\0\0\0WAVEfmt "]) {
      expect(await images.store(new Blob([body], { type: "image/jpeg" }), fits)).toEqual({
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

    expect(await images.store(new Blob([oversized]), fits)).toEqual({
      kind: "rejected",
      reason: "too_large",
    });
    expect(puts).toHaveLength(0);
  });

  test("a picture of exactly 10 MB is stored", async () => {
    const { images } = fakeBucket();
    const limit = new Uint8Array(10 * 1024 * 1024);
    limit.set(SAMPLES.jpg);

    expect(await images.store(new Blob([limit]), fits)).toMatchObject({ kind: "stored" });
  });
});
