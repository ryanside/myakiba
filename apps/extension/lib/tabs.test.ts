import { describe, expect, test } from "bun:test";
import { TabClosed } from "./errors/tab-closed";
import { TabEditRefused } from "./errors/tab-edit-refused";
import { TabOpenFailed } from "./errors/tab-open-failed";
import { TabQueryFailed } from "./errors/tab-query-failed";
import { WindowFocusRefused } from "./errors/window-focus-refused";
import { resultTabs } from "./tabs";

const refused = () => Promise.reject(new Error("refused by the browser"));
const tabs = resultTabs(
  { get: refused, query: refused, create: refused, update: refused, remove: refused },
  { update: refused },
);

describe("the browser's tabs, read as Results", () => {
  test("a tab the browser no longer has is closed", async () => {
    const read = await tabs.get(7);

    expect(read.isErr() && TabClosed.is(read.error) && read.error.tabId).toBe(7);
  });

  test.each([
    ["update", () => tabs.update(7, { active: true })],
    ["remove", () => tabs.remove(7)],
  ] as const)("a refused %s names the tab and the edit", async (op, call) => {
    const edited = await call();

    expect(edited.isErr() && TabEditRefused.is(edited.error) && edited.error).toMatchObject({
      tabId: 7,
      op,
    });
  });

  test("a refused new tab names its window", async () => {
    const created = await tabs.create({ url: "http://mfc.test/", active: false, windowId: 3 });

    expect(created.isErr() && TabOpenFailed.is(created.error) && created.error.windowId).toBe(3);
  });

  test("a refused query is its own failure", async () => {
    const found = await tabs.query({
      url: "http://mfc.test/*",
      status: "complete",
      discarded: false,
    });

    expect(found.isErr() && TabQueryFailed.is(found.error)).toBe(true);
  });

  test("a refused window focus names the window", async () => {
    const focused = await tabs.focusWindow(3);

    expect(focused.isErr() && WindowFocusRefused.is(focused.error) && focused.error.windowId).toBe(
      3,
    );
  });

  test("every refusal keeps the browser's error as its cause", async () => {
    const read = await tabs.get(7);

    expect(read.isErr() && read.error.cause).toEqual(new Error("refused by the browser"));
  });
});
