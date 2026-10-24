import { afterEach, describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { itemId } from "../test/fake-browser";
import {
  armCollector,
  pageAnswerCodec,
  pictureAnswerCodec,
  readAnswer,
  runArmed,
  stopCollector,
} from "./collect";
import type { CollectRequest, CollectedPage } from "./collect";
import { CollectorAnswerInvalid } from "./errors/collector-answer-invalid";
import { MfcPageFetchFailed } from "./errors/mfc-page-fetch-failed";
import { PictureFetchFailed } from "./errors/picture-fetch-failed";
import { PictureRejected } from "./errors/picture-rejected";
import { PictureTimedOut } from "./errors/picture-timed-out";

const REQUEST: CollectRequest = { kind: "page", mode: "fetch", mfcItemId: itemId(1) };

afterEach(() => {
  globalThis.myakibaCollectRequest = undefined;
  globalThis.myakibaCollectAbort = undefined;
});

describe("the functions injected into the MFC tab", () => {
  test("a stop that lands before the collector runs still aborts its fetch", async () => {
    armCollector(REQUEST);
    stopCollector();

    expect(await runArmed(async (_request, signal) => signal.aborted)).toBe(true);
  });

  test("a stop that lands while the collector runs aborts its fetch", async () => {
    armCollector(REQUEST);
    const running = runArmed(
      (_request, signal) =>
        new Promise<boolean>((resolve) => {
          signal.addEventListener("abort", () => resolve(true));
        }),
    );
    stopCollector();

    expect(await running).toBe(true);
  });

  test("a stop that lands after the collector finished aborts nothing", async () => {
    armCollector(REQUEST);
    const signal = await runArmed(async (_request, running) => running);
    stopCollector();

    expect(signal.aborted).toBe(false);
  });
});

describe("the collector's answer", () => {
  const TAB_ID = 7;
  const PAGE: CollectedPage = {
    status: 200,
    cfMitigated: null,
    retryAfter: "5",
    html: "<html></html>",
  };
  /** The answer crosses from the tab to the background by structured clone. */
  const injected = <Answer>(answer: Answer) => ({ result: structuredClone(answer) });

  test("a page goes through intact", async () => {
    const answer = pageAnswerCodec.serializeUnsafe(Result.ok(PAGE));
    const read = await readAnswer(pageAnswerCodec, injected(answer), TAB_ID, "page");

    expect(read.isOk() && read.value).toEqual(PAGE);
  });

  test("a failed fetch in the tab goes through as that failure, with only its safe fields", async () => {
    const failure = new MfcPageFetchFailed({
      mfcItemId: itemId(1),
      cause: { name: "TypeError", message: "Failed to fetch" },
    });
    const answer = pageAnswerCodec.serializeUnsafe(Result.err(failure));
    const read = await readAnswer(pageAnswerCodec, injected(answer), TAB_ID, "page");

    expect(answer).toEqual({
      status: "error",
      error: {
        _tag: "MfcPageFetchFailed",
        mfcItemId: itemId(1),
        cause: { name: "TypeError", message: "Failed to fetch" },
      },
    });
    expect(read.isErr() && MfcPageFetchFailed.is(read.error) && read.error).toMatchObject({
      mfcItemId: 1,
      cause: { name: "TypeError", message: "Failed to fetch" },
    });
  });

  test.each([
    ["a page from a collector without the envelope", PAGE],
    ["an envelope whose page lacks its html", { status: "ok", value: { ...PAGE, html: 1 } }],
    ["an error the codec does not know", { status: "error", error: { _tag: "Other" } }],
    ["no answer, as from a script that failed in the tab", undefined],
  ])("%s is an invalid answer from that tab", async (_name, answer) => {
    const read = await readAnswer(pageAnswerCodec, injected(answer), TAB_ID, "page");

    expect(read.isErr() && CollectorAnswerInvalid.is(read.error) && read.error).toMatchObject({
      tabId: TAB_ID,
      kind: "page",
    });
  });

  test("no frame at all is an invalid answer", async () => {
    const read = await readAnswer(pageAnswerCodec, undefined, TAB_ID, "page");

    expect(read.isErr() && CollectorAnswerInvalid.is(read.error)).toBe(true);
  });

  test.each([
    ["a picture", { base64: "AQID", contentType: "image/jpeg" }],
    ["no picture", null],
  ])("%s goes through intact", async (_name, picture) => {
    const answer = pictureAnswerCodec.serializeUnsafe(Result.ok(picture));
    const read = await readAnswer(pictureAnswerCodec, injected(answer), TAB_ID, "public-picture");

    expect(read.isOk() && read.value).toEqual(picture);
  });

  test.each([
    [
      "a rejected picture",
      new PictureRejected({ reason: "too_large", status: 200, bytes: 11 }),
      { _tag: "PictureRejected", reason: "too_large", status: 200, bytes: 11 } as const,
    ],
    [
      "a failed picture fetch",
      new PictureFetchFailed({ cause: { name: "TypeError", message: "Failed to fetch" } }),
      {
        _tag: "PictureFetchFailed",
        cause: { name: "TypeError", message: "Failed to fetch" },
      } as const,
    ],
    [
      "a picture that timed out",
      new PictureTimedOut({ timeoutMs: 20_000 }),
      { _tag: "PictureTimedOut", timeoutMs: 20_000 } as const,
    ],
  ])("%s goes through as that failure, with only its safe fields", async (_name, failure, wire) => {
    const answer = pictureAnswerCodec.serializeUnsafe(Result.err(failure));
    const read = await readAnswer(pictureAnswerCodec, injected(answer), TAB_ID, "gated-picture");

    expect(answer).toEqual({ status: "error", error: wire });
    expect(read.isErr() && read.error).toBeInstanceOf(failure.constructor);
    expect(read.isErr() && read.error).toMatchObject(wire);
  });

  test.each([
    ["a picture from a collector without the envelope", { base64: "AQID" }],
    [
      "a rejection with a reason the codec does not know",
      {
        status: "error",
        error: { _tag: "PictureRejected", reason: "blurry", status: 200, bytes: null },
      },
    ],
    [
      "a page failure in a picture answer",
      {
        status: "error",
        error: { _tag: "MfcPageFetchFailed", mfcItemId: 1, cause: { name: "E", message: "m" } },
      },
    ],
  ])("%s is an invalid answer from that tab", async (_name, answer) => {
    const read = await readAnswer(pictureAnswerCodec, injected(answer), TAB_ID, "public-picture");

    expect(read.isErr() && CollectorAnswerInvalid.is(read.error) && read.error).toMatchObject({
      tabId: TAB_ID,
      kind: "public-picture",
    });
  });
});
