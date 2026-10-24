import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Panic } from "better-result";
import type { StandardSchemaV1 } from "better-result";
import collector from "../entrypoints/collector";
import { itemId } from "../test/fake-browser";
import { armCollector, pageAnswerCodec, pictureAnswerCodec, readAnswer } from "./collect";
import type { AnswerCodec, CollectRequest } from "./collect";
import { ORIGINS } from "./config";
import { PictureFetchFailed } from "./errors/picture-fetch-failed";

const TAB_ID = 7;
const PICTURE_URL = `${ORIGINS.mfc}/upload/items/1/1.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const shown = Object.getOwnPropertyDescriptor(globalThis, "location");

afterEach(() => {
  if (shown) Object.defineProperty(globalThis, "location", shown);
  else Reflect.deleteProperty(globalThis, "location");
  globalThis.myakibaCollectRequest = undefined;
  globalThis.myakibaCollectAbort = undefined;
});

/** Runs the collector in an MFC tab, and reads its answer in the background as the browser hands it over. */
async function collectInTab<Ok extends StandardSchemaV1, Fails extends StandardSchemaV1>(
  request: CollectRequest,
  codec: AnswerCodec<Ok, Fails>,
) {
  // The collector reads only the tab's origin and address, which a URL has as well.
  Object.defineProperty(globalThis, "location", {
    value: new URL(`${ORIGINS.mfc}/item/1`),
    configurable: true,
  });
  armCollector(request);
  let answer: unknown;
  try {
    answer = await collector.main();
  } catch {
    // The browser answers undefined for a script whose promise rejects.
    answer = undefined;
  }
  return readAnswer(codec, { result: structuredClone(answer) }, TAB_ID, request.kind);
}

const readGatedPicture = () =>
  collectInTab({ kind: "gated-picture", url: PICTURE_URL }, pictureAnswerCodec);

/** The defect the background panics with, or null when it read an answer instead. */
async function defectOf(read: Promise<unknown>): Promise<Panic | null> {
  try {
    await read;
    return null;
  } catch (error) {
    if (Panic.is(error)) return error;
    throw error;
  }
}

describe("the collector reading a picture in its tab", () => {
  test("answers a fetch that fails as PictureFetchFailed", async () => {
    using _fetch = spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const read = await readGatedPicture();

    expect(read.isErr() && PictureFetchFailed.is(read.error)).toBe(true);
  });

  test("hands a defect while it reads the picture to the background as a Panic", async () => {
    using _fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response(JPEG));
    using _base64 = spyOn(Uint8Array.prototype, "toBase64").mockImplementation(() => {
      throw new TypeError("toBase64 is not a function");
    });

    await expect(readGatedPicture()).rejects.toBeInstanceOf(Panic);
  });
});

describe("a defect in the collector's tab", () => {
  test("keeps the message of the Panic it hit while it read a picture", async () => {
    using _fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response(JPEG));
    using _base64 = spyOn(Uint8Array.prototype, "toBase64").mockImplementation(() => {
      throw new TypeError("toBase64 is not a function");
    });
    const defect = await defectOf(readGatedPicture());

    expect(defect?.message).toBe(
      "The collector's gated-picture run in tab 7 hit a defect: Panic: andThen callback threw",
    );
    expect(defect?.cause instanceof Error && defect.cause.stack).toContain(
      "toBase64 is not a function",
    );
  });

  test("while it reads a fetched page crosses to the background as a Panic with its message", async () => {
    using _fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html></html>"));
    const parser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
    Object.defineProperty(globalThis, "DOMParser", {
      value: class {
        parseFromString(): never {
          throw new TypeError("parseFromString is not a function");
        }
      },
      configurable: true,
    });
    try {
      const defect = await defectOf(
        collectInTab({ kind: "page", mode: "fetch", mfcItemId: itemId(1) }, pageAnswerCodec),
      );

      expect(defect?.message).toBe(
        "The collector's page run in tab 7 hit a defect: Panic: map callback threw",
      );
      expect(defect?.cause instanceof Error && defect.cause.stack).toContain(
        "parseFromString is not a function",
      );
    } finally {
      if (parser) Object.defineProperty(globalThis, "DOMParser", parser);
      else Reflect.deleteProperty(globalThis, "DOMParser");
    }
  });
});
