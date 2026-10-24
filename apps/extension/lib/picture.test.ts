import { describe, expect, test } from "bun:test";
import type { Origins } from "./origins";
import { pictureToRead, readPicture } from "./picture";

const MB = 1024 * 1024;
const ascii = (text: string) => [...new TextEncoder().encode(text)];
async function kept(response: Response) {
  const read = await readPicture(response);
  return read.unwrapOr(null);
}

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

    expect(await kept(response)).toEqual({
      base64: new Uint8Array(bytes).toBase64(),
      contentType,
    });
  });

  test("drops an HTML page served as a picture", async () => {
    const response = new Response("<!DOCTYPE html><title>Sign in</title>", {
      headers: { "content-type": "image/jpeg" },
    });

    expect(await kept(response)).toBeNull();
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

    expect(await kept(new Response(endless))).toBeNull();
    expect(cancelled).toBe(true);
  });

  test("drops a response that declares more than 10 MB without reading it", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(body, { headers: { "content-length": String(10 * MB + 1) } });

    expect(await kept(response)).toBeNull();
    expect(cancelled).toBe(true);
  });

  test("drops an empty or failed response", async () => {
    expect(await kept(new Response(new Uint8Array()))).toBeNull();
    expect(
      await kept(new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 404 })),
    ).toBeNull();
  });
});

describe("readPicture's rejections", () => {
  async function rejection(response: Response) {
    const read = await readPicture(response);
    return read.isErr() && read.error;
  }

  test("an error status is http_status", async () => {
    const response = new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 404 });

    expect(await rejection(response)).toMatchObject({
      _tag: "PictureRejected",
      reason: "http_status",
      status: 404,
      bytes: null,
    });
  });

  test("an answer with no body, or an empty one, is no_body", async () => {
    expect(await rejection(new Response(null))).toMatchObject({
      reason: "no_body",
      status: 200,
      bytes: null,
    });
    expect(await rejection(new Response(new Uint8Array()))).toMatchObject({
      reason: "no_body",
      bytes: 0,
    });
  });

  test("a body over 10 MB is too_large, by its declared length or by what was read", async () => {
    const declared = new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      headers: { "content-length": String(10 * MB + 1) },
    });
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(MB).fill(0xff));
      },
    });

    expect(await rejection(declared)).toMatchObject({ reason: "too_large", bytes: 10 * MB + 1 });
    expect(await rejection(new Response(endless))).toMatchObject({
      reason: "too_large",
      bytes: 11 * MB,
    });
  });

  test("bytes of no known image format are unknown_format, with their count", async () => {
    const html = "<!DOCTYPE html><title>Sign in</title>";

    expect(await rejection(new Response(html))).toMatchObject({
      reason: "unknown_format",
      status: 200,
      bytes: html.length,
    });
  });
});

describe("pictureToRead", () => {
  const origins: Origins = {
    web: "http://myakiba.test",
    mfc: "http://mfc.test",
    mfcStatic: "http://static.mfc.test",
  };
  const requested = "https://static.myfigurecollection.net/upload/items/1/98777-a1b2c.jpg";
  const configured = "http://static.mfc.test/upload/items/1/98777-a1b2c.jpg";

  test("is the configured URL when the tab shows the picture asked for", () => {
    expect(pictureToRead(requested, configured, origins)?.href).toBe(configured);
  });

  test("compares the URLs once normalized", () => {
    const shown = "HTTP://STATIC.MFC.TEST:80/upload/items/1/./98777-a1b2c.jpg";
    expect(pictureToRead(requested, shown, origins)?.href).toBe(configured);
  });

  test.each([
    ["another picture", "http://static.mfc.test/upload/items/1/98778-a1b2c.jpg"],
    ["the picture with a query", `${configured}?redirected=1`],
    ["the picture on the MFC origin", "http://mfc.test/upload/items/1/98777-a1b2c.jpg"],
    ["a challenge page", "http://static.mfc.test/cdn-cgi/challenge-platform/h/b"],
    ["an unreadable URL", ""],
  ])("is null when the tab shows %s", (_name, shown) => {
    expect(pictureToRead(requested, shown, origins)).toBeNull();
  });

  test.each([
    ["outside /upload/items/", "https://static.myfigurecollection.net/upload/users/1/1.jpg"],
    ["on the MFC origin", "https://myfigurecollection.net/upload/items/1/98777-a1b2c.jpg"],
    ["on another origin", "https://example.com/upload/items/1/98777-a1b2c.jpg"],
  ])("is null for a requested URL %s, even when the tab shows it", (_name, url) => {
    const shown = URL.parse(url);
    const mapped = shown && new URL(shown.pathname, origins.mfcStatic).href;
    expect(pictureToRead(url, mapped ?? url, origins)).toBeNull();
    expect(pictureToRead(url, url, origins)).toBeNull();
  });
});
