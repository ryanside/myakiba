import { describe, expect, test } from "bun:test";
import { readPicture } from "./picture";

const MB = 1024 * 1024;
const ascii = (text: string) => [...new TextEncoder().encode(text)];

describe("readPicture", () => {
  test.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0, ...ascii("JFIF")]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/gif", ascii("GIF89a")],
    ["image/webp", [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]],
    ["image/avif", [0, 0, 0, 0x1c, ...ascii("ftypavif"), 0, 0, 0, 0]],
  ])("keeps %s and names it by its bytes", async (contentType, bytes) => {
    const response = new Response(new Uint8Array(bytes), {
      headers: { "content-type": "application/octet-stream" },
    });

    expect(await readPicture(response)).toEqual({
      base64: new Uint8Array(bytes).toBase64(),
      contentType,
    });
  });

  test("drops an HTML page served as a picture", async () => {
    const response = new Response("<!DOCTYPE html><title>Sign in</title>", {
      headers: { "content-type": "image/jpeg" },
    });

    expect(await readPicture(response)).toBeNull();
  });

  test("stops reading past 10 MB without waiting for the rest", async () => {
    let sent = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent <= 10) controller.enqueue(new Uint8Array(MB).fill(0xff));
        sent++;
      },
      cancel() {
        cancelled = true;
      },
    });

    expect(await readPicture(new Response(endless))).toBeNull();
    expect(cancelled).toBe(true);
  });

  test("drops an empty or failed response", async () => {
    expect(await readPicture(new Response(new Uint8Array()))).toBeNull();
    expect(
      await readPicture(new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 404 })),
    ).toBeNull();
  });
});
