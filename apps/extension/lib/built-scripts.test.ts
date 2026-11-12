import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import vm from "node:vm";
import { BUILD_TIMEOUT_MS, buildForTest, testOutput as output } from "../test/test-build";
import { pictureAnswerCodec, readAnswer } from "./collect";

const ORIGINS = {
  WXT_WEB_ORIGIN: "http://localhost:3001",
  WXT_MFC_ORIGIN: "http://127.0.0.1:4601",
  WXT_MFC_STATIC_ORIGIN: "http://127.0.0.1:4602",
} as const;
const BROWSERS = ["chrome", "firefox"] as const;
const JITLESS = "globalThis.__zod_globalConfig={jitless:!0}";
const SCRIPTS = ["background.js", "collector.js", "content-scripts/myakiba.js", "mfc.js"];

async function builtScripts(browser: (typeof BROWSERS)[number]) {
  const files = await Array.fromAsync(new Bun.Glob("**/*.js").scan(output(browser)));
  return Promise.all(
    files.map(async (file) => ({
      file,
      text: await Bun.file(path.join(output(browser), file)).text(),
    })),
  );
}

beforeAll(async () => {
  for (const browser of BROWSERS) await buildForTest(browser, ORIGINS);
}, BUILD_TIMEOUT_MS);

describe.each(BROWSERS)("a %s build", (browser) => {
  test("starts every script with the wrapper WXT writes, so an injected script answers with its wrapper's value", async () => {
    const scripts = await builtScripts(browser);

    expect(scripts.map(({ file }) => file).toSorted()).toEqual(SCRIPTS);
    for (const { file, text } of scripts) {
      const start = file === "background.js" ? "var background=(function(){" : "(function(){";
      expect({ file, start: text.slice(0, start.length) }).toEqual({ file, start });
    }
  });

  test("turns off zod's eval probe in every script before zod sets up its config", async () => {
    for (const { file, text } of await builtScripts(browser)) {
      const jitless = text.indexOf(JITLESS);
      const firstRead = text.indexOf("__zod_globalConfig") - "globalThis.".length;

      expect({ file, jitless: jitless !== -1, firstRead }).toEqual({
        file,
        jitless: true,
        firstRead: jitless,
      });
    }
  });

  test("answers an injected collector run with the collector's answer", async () => {
    const collector = await Bun.file(path.join(output(browser), "collector.js")).text();
    const tab = {
      myakibaCollectRequest: {
        kind: "public-picture",
        url: "https://static.myfigurecollection.net/upload/items/1/2336325.jpg",
      },
      location: new URL(`${ORIGINS.WXT_MFC_ORIGIN}/item/2336325`),
      URL,
      AbortController,
      AbortSignal,
      console,
    };

    const completion: unknown = vm.runInNewContext(collector, tab, { filename: "collector.js" });
    const answer = await readAnswer(
      pictureAnswerCodec,
      { result: await completion },
      1,
      "public-picture",
    );

    expect(answer.isOk() ? { picture: answer.value } : { failure: answer.error }).toEqual({
      picture: null,
    });
  });
});
