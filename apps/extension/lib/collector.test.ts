import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Panic } from "better-result";
import collector from "../entrypoints/collector";
import { armCollector, pictureAnswerCodec, readAnswer } from "./collect";
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

/** Runs the collector in an MFC tab for a gated picture, and reads its answer in the background as the browser hands it over. */
async function readGatedPicture() {
  // The collector reads only the tab's origin and address, which a URL has as well.
  Object.defineProperty(globalThis, "location", {
    value: new URL(`${ORIGINS.mfc}/item/1`),
    configurable: true,
  });
  armCollector({ kind: "gated-picture", url: PICTURE_URL });
  const answer: unknown = await collector.main();
  return readAnswer(
    pictureAnswerCodec,
    { result: structuredClone(answer) },
    TAB_ID,
    "gated-picture",
  );
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
