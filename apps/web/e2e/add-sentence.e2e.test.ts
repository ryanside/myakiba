// The Add sentence's fit, laid out by a real browser with the app's stylesheet. Unit tests run in a
// DOM that applies no CSS, so they cannot see a container query hide a word or a control.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { caseQuery, LISTS } from "./sentence/cases";
import type { SentenceCase } from "./sentence/cases";

setDefaultTimeout(120_000);

const WEB = path.join(import.meta.dir, "..");
const out = mkdtempSync(path.join(tmpdir(), "add-sentence-"));
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

beforeAll(async () => {
  const build = Bun.spawnSync(
    ["bun", "run", "e2e:build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"],
    {
      cwd: WEB,
      env: {
        ...process.env,
        VITE_SERVER_URL: "http://127.0.0.1:9",
        VITE_TURNSTILE_SITE_KEY: "e2e",
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (build.exitCode !== 0) throw new Error("The sentence harness did not build");
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const file = Bun.file(path.join(out, pathname === "/" ? "index.html" : pathname));
      return (await file.exists()) ? new Response(file) : new Response("", { status: 404 });
    },
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await server.stop(true);
  rmSync(out, { recursive: true, force: true });
});

/** The sentence's width at each viewport the page is checked at, and at each step between. */
const VIEWPORTS = [1280, 900, 768, 672, 600, 390, 320] as const;
const sentenceWidth = (viewport: number) => Math.min(viewport - 32, 1024);

type Tier = "full" | "verb" | "icons" | "no also on" | "no lead" | "folded";
function tierAt(width: number): Tier {
  const rem = width / 16;
  if (rem >= 48) return "full";
  if (rem >= 41) return "verb";
  if (rem >= 36) return "icons";
  if (rem >= 31) return "no also on";
  if (rem >= 21) return "no lead";
  return "folded";
}

type Expected = {
  readonly lead: string;
  readonly choice: string;
  readonly label: string;
  readonly verb: string;
  readonly lists: string;
  readonly held: string;
};

function expectedOf(sentence: SentenceCase): Expected {
  const { to, rows, selected, lists, wishlist } = sentence;
  const noun = rows === 1 ? "item" : "items";
  const phrase = selected === rows ? `${rows} ${noun}` : `${selected} of ${rows} ${noun}`;
  const titles = lists.map((id) => LISTS.find((list) => list.id === id)?.title ?? id);
  const named = listWords(titles);
  const targets = [...(wishlist ? ["Wishlist"] : []), ...(named.target ? [named.target] : [])];
  const keep = to === "none" && targets.length === 0;
  const [label, verb] = ((): readonly [string, string] => {
    switch (to) {
      case "unset":
        return ["Choose where these go", "Add"];
      case "collection":
        return [`Add ${selected} to collection`, "Add"];
      case "order-new":
        return [`Create order with ${selected}`, "Create"];
      case "order-existing":
        return [`Add ${selected} to order`, "Add"];
      case "none":
        return keep
          ? [`Keep ${selected} in Item Database`, "Keep"]
          : [`Add ${selected} to ${targets.join(" and ")}`, "Add"];
    }
  })();
  return {
    lead: to === "none" ? `Keep ${phrase} in` : `Add ${phrase} to`,
    choice: {
      unset: "choose where",
      collection: "Collection",
      "order-new": "New Order",
      "order-existing": "Existing Order",
      none: "Item Database",
    }[to],
    label,
    verb,
    lists: named.trigger,
    held: targets.length === 0 ? "Wishlist and Lists" : `Also on ${targets.join(" and ")}`,
  };
}

/** What the Lists trigger says for `titles`, and how a commit's label names them. */
function listWords(titles: readonly string[]) {
  const [first] = titles;
  if (first === undefined) return { trigger: "Lists", target: null };
  if (titles.length === 1) return { trigger: first, target: `‘${first}’` };
  return { trigger: `${titles.length} Lists`, target: `${titles.length} Lists` };
}

/** The words each part of the line shows, in order, as a sighted reader sees them. */
function shownWords(expected: Expected, sentence: SentenceCase, tier: Tier): readonly string[] {
  const count = sentence.lists.length > 0 ? String(sentence.lists.length) : "";
  const label = tier === "full" ? expected.label : expected.verb;
  switch (tier) {
    case "full":
    case "verb":
      return [expected.lead, expected.choice, "also on", "Wishlist", "and", expected.lists, label];
    case "icons":
      return [expected.lead, expected.choice, "also on", "", count, label];
    case "no also on":
      return [expected.lead, expected.choice, "", count, label];
    case "no lead":
      return [expected.choice, "", count, label];
    case "folded":
      return [expected.choice, count, label];
  }
}

type Part = {
  readonly words: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};
type Layout = {
  readonly row: { readonly left: number; readonly right: number; readonly height: number };
  readonly parts: readonly Part[];
  readonly overflow: boolean;
  readonly pageOverflow: boolean;
  readonly controls: number;
};

/** Each part of the line that shows, with the words it shows and the box its shown content takes. */
function measure(): Layout {
  const section = document.querySelector('section[aria-label="Destination"]');
  if (!(section instanceof HTMLElement)) throw new Error("No sentence");
  const shows = (element: Element, top: Element) => {
    for (let at: Element | null = element; at && at !== top.parentElement; at = at.parentElement) {
      const style = getComputedStyle(at);
      // A box-less wrapper shows what its children show.
      if (style.display === "contents") continue;
      const box = at.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1 || style.visibility !== "visible") return false;
    }
    return true;
  };
  const parts = [...section.children]
    .filter((child) => shows(child, child))
    .map((child) => {
      const boxes = [child, ...child.querySelectorAll("*")]
        .filter(
          (element) => getComputedStyle(element).display !== "contents" && shows(element, child),
        )
        .map((element) => element.getBoundingClientRect());
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      let words = "";
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement && shows(node.parentElement, child)) words += node.textContent;
      }
      return {
        words: words.trim(),
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
        top: Math.min(...boxes.map((box) => box.top)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
      };
    });
  const row = section.getBoundingClientRect();
  return {
    row: { left: row.left, right: row.right, height: row.height },
    parts,
    overflow: section.scrollWidth > section.clientWidth,
    pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
    controls: section.querySelectorAll("button, [role=combobox], [role=checkbox]").length,
  };
}

const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

async function open(sentence: SentenceCase, theme: "dark" | "light" = "dark") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${server.url.href}${caseQuery(sentence, theme)}`);
  await page.getByRole("region", { name: "Destination" }).waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await settle(page);
  return { page, errors };
}

/**
 * Gives the sentence the width it has at `viewport`: by that viewport, or by its frame in a wide
 * viewport, as the steps follow the sentence's own width and not the window's.
 */
async function sizeTo(page: Page, viewport: number, by: "viewport" | "frame") {
  await page.setViewportSize({ width: by === "viewport" ? viewport : 1280, height: 800 });
  await page.evaluate(
    (frameWidth) => {
      const frame = document.querySelector<HTMLElement>("#frame");
      if (!frame) throw new Error("No frame");
      frame.style.maxWidth = frameWidth === null ? "" : "none";
      frame.style.width = frameWidth === null ? "" : `${frameWidth}px`;
    },
    by === "viewport" ? null : sentenceWidth(viewport) + 32,
  );
  await settle(page);
}

function expectOneLine(layout: Layout, context: string) {
  const { row, parts } = layout;
  expect({ context, height: row.height }).toEqual({ context, height: 32 });
  expect({ context, overflow: layout.overflow, page: layout.pageOverflow }).toEqual({
    context,
    overflow: false,
    page: false,
  });
  for (const [index, part] of parts.entries()) {
    expect({
      context,
      part: part.words,
      inside: part.left >= row.left - 0.5 && part.right <= row.right + 0.5,
    }).toEqual({
      context,
      part: part.words,
      inside: true,
    });
    const next = parts[index + 1];
    if (next) {
      expect({
        context,
        between: [part.words, next.words],
        clear: part.right <= next.left + 0.5,
      }).toEqual({
        context,
        between: [part.words, next.words],
        clear: true,
      });
    }
  }
}

async function expectNames(page: Page, expected: Expected, tier: Tier, context: string) {
  const section = page.getByRole("region", { name: "Destination" });
  const names = {
    commit: await section.getByRole("button", { name: expected.label, exact: true }).count(),
    lists: await section
      .getByRole("button", {
        name: tier === "folded" ? expected.held : expected.lists,
        exact: true,
      })
      .count(),
    wishlist: await section.getByRole("checkbox", { name: "Wishlist", exact: true }).count(),
    choice: await section.getByRole("combobox", { name: "Where these go" }).count(),
  };
  expect({ context, ...names }).toEqual({
    context,
    commit: 1,
    lists: 1,
    wishlist: tier === "folded" ? 0 : 1,
    choice: 1,
  });
}

const DESTINATIONS: readonly Pick<SentenceCase, "to" | "lists" | "wishlist">[] = [
  { to: "unset", lists: [], wishlist: false },
  { to: "collection", lists: [], wishlist: false },
  { to: "order-new", lists: [], wishlist: false },
  { to: "order-existing", lists: [], wishlist: false },
  { to: "none", lists: [], wishlist: true },
  { to: "none", lists: ["shelf0000001"], wishlist: false },
  { to: "none", lists: [], wishlist: false },
];
const COUNTS = [
  { rows: 1, selected: 1 },
  { rows: 12, selected: 12 },
  { rows: 12, selected: 11 },
] as const;

describe("every destination keeps one line, and shows what fits each width", () => {
  for (const destination of DESTINATIONS) {
    for (const count of COUNTS) {
      const sentence: SentenceCase = { ...destination, ...count };
      test(`${caseQuery(sentence)}`, async () => {
        const { page, errors } = await open(sentence);
        const expected = expectedOf(sentence);
        for (const by of ["viewport", "frame"] as const) {
          for (const viewport of VIEWPORTS) {
            const width = sentenceWidth(viewport);
            const tier = tierAt(width);
            const context = `${by} ${width}px, ${tier}`;
            await sizeTo(page, viewport, by);
            const layout = await page.evaluate(measure);
            expectOneLine(layout, context);
            expect({ context, words: layout.parts.map((part) => part.words) }).toEqual({
              context,
              words: [...shownWords(expected, sentence, tier)],
            });
            await expectNames(page, expected, tier, context);
          }
        }
        expect(errors).toEqual([]);
        await page.close();
      });
    }
  }
});

/** The open Lists popup, where it sits against the one control that opened it, and what it offers. */
async function popupState(page: Page) {
  await page.evaluate(async () => {
    const dialog = document.querySelector("[role=dialog]");
    await Promise.allSettled(
      dialog?.getAnimations({ subtree: true }).map((run) => run.finished) ?? [],
    );
  });
  return page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Destination"]');
    const triggers = [...(section?.querySelectorAll("button[aria-haspopup=dialog]") ?? [])];
    const dialogs = [...document.querySelectorAll("[role=dialog]")];
    const [trigger] = triggers;
    const [dialog] = dialogs;
    if (!trigger || !dialog) throw new Error("No trigger or no popup");
    const at = trigger.getBoundingClientRect();
    const box = dialog.getBoundingClientRect();
    return {
      triggers: triggers.length,
      popups: dialogs.length,
      triggerShows: at.width > 1 && at.height > 1,
      // Below the trigger, and across from it.
      anchored:
        box.top - at.bottom >= 0 &&
        box.top - at.bottom <= 12 &&
        box.left < at.right &&
        box.right > at.left,
      name: dialog.getAttribute("aria-label"),
      wishlist: [...dialog.querySelectorAll("[role=checkbox]")].some(
        (checkbox) => checkbox.parentElement?.textContent?.trim() === "Wishlist",
      ),
    };
  });
}

async function escapeReturnsFocus(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  return page.evaluate(() => {
    const focused = document.activeElement;
    const box = focused?.getBoundingClientRect();
    return (
      focused?.getAttribute("aria-haspopup") === "dialog" &&
      focused.closest('section[aria-label="Destination"]') !== null &&
      box !== undefined &&
      box.width > 1
    );
  });
}

describe("the Lists popup stays with its control across a resize", () => {
  const sentence: SentenceCase = {
    to: "collection",
    rows: 12,
    selected: 12,
    lists: ["shelf0000001"],
    wishlist: true,
  };

  test("wide to narrow", async () => {
    const { page, errors } = await open(sentence);
    const section = page.getByRole("region", { name: "Destination" });
    await section.getByRole("button", { name: "Display shelf", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    expect(await popupState(page)).toMatchObject({
      name: "Lists",
      wishlist: false,
      anchored: true,
    });

    await sizeTo(page, 320, "viewport");
    expect(await popupState(page)).toEqual({
      triggers: 1,
      popups: 1,
      triggerShows: true,
      anchored: true,
      name: "Wishlist and Lists",
      wishlist: true,
    });
    expect(await escapeReturnsFocus(page)).toBe(true);
    expect(
      await section
        .getByRole("button", { name: "Also on Wishlist and ‘Display shelf’", exact: true })
        .evaluate((element) => element === document.activeElement),
    ).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });

  test("narrow to wide", async () => {
    const { page, errors } = await open(sentence);
    await sizeTo(page, 320, "viewport");
    const section = page.getByRole("region", { name: "Destination" });
    await section
      .getByRole("button", { name: "Also on Wishlist and ‘Display shelf’", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    expect(await popupState(page)).toMatchObject({
      name: "Wishlist and Lists",
      wishlist: true,
      anchored: true,
    });

    await sizeTo(page, 1280, "viewport");
    expect(await popupState(page)).toEqual({
      triggers: 1,
      popups: 1,
      triggerShows: true,
      anchored: true,
      name: "Lists",
      wishlist: false,
    });
    expect(await escapeReturnsFocus(page)).toBe(true);
    expect(
      await section
        .getByRole("button", { name: "Display shelf", exact: true })
        .evaluate((element) => element === document.activeElement),
    ).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
});
