import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";
import type { BrowserContext, CDPSession, Page, Worker } from "playwright";
import { checkManifest, manifestSchema } from "../lib/manifest-policy";
import { GATED_ID, E2E_ORIGINS, PICTURE_SHA256, PUBLIC_ID, SFW_ID, startMocks } from "./mock-mfc";

const EXTENSION = path.join(import.meta.dir, "../.output/chrome-mv3-e2e");
const MFC = E2E_ORIGINS.WXT_MFC_ORIGIN;
const WEB = E2E_ORIGINS.WXT_WEB_ORIGIN;
const SCENARIO_TIMEOUT_MS = 60_000;

type AxValue = { readonly value?: unknown };
type AxNode = {
  readonly ignored: boolean;
  readonly role?: AxValue;
  readonly name?: AxValue;
  readonly backendDOMNodeId?: number;
  readonly properties?: readonly { readonly name: string; readonly value: AxValue }[];
};
const mocks = startMocks();
let context: BrowserContext;

beforeAll(() => {
  const build = Bun.spawnSync(["bunx", "wxt", "build", "--mode", "e2e"], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, ...E2E_ORIGINS },
  });
  if (build.exitCode !== 0) throw new Error(`the e2e build failed\n${build.stderr.toString()}`);
});

afterEach(async () => {
  await context.close();
  mocks.requests.length = 0;
});

afterAll(() => mocks.stop());

async function launch(options: { backForwardCache?: boolean } = {}): Promise<Worker> {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    ignoreDefaultArgs: options.backForwardCache ? ["--disable-back-forward-cache"] : [],
  });
  const local = new Set([new URL(MFC).origin, new URL(WEB).origin]);
  // The fixtures name MFC's real image host and ad partners, which a test must not reach.
  await context.route(
    (url) => !local.has(url.origin),
    (route) => route.abort(),
  );
  const [running] = context.serviceWorkers();
  const worker = running ?? (await context.waitForEvent("serviceworker"));
  const session = await context.newPage();
  await session.goto(`${MFC}/`);
  await session.close();
  mocks.requests.length = 0;
  return worker;
}

async function axNodes(session: CDPSession): Promise<readonly AxNode[]> {
  const { nodes } = (await session.send("Accessibility.getFullAXTree")) as {
    nodes: readonly AxNode[];
  };
  return nodes.filter((node) => !node.ignored);
}

/**
 * Every event and message the extension's scripts send in this page, from before each script's first statement. A hook
 * added with addInitScript misses them, because a content script calls its own isolated world's dispatchEvent. The
 * breakpoint's condition installs the hook and answers false, so the page never pauses.
 */
async function watchSends(page: Page): Promise<readonly string[]> {
  const sends: string[] = [];
  const watcher = await context.newCDPSession(page);
  watcher.on("Runtime.bindingCalled", ({ payload }) => sends.push(payload));
  await watcher.send("Runtime.enable");
  await watcher.send("Runtime.addBinding", { name: "reportSend" });
  await watcher.send("Debugger.enable");
  await watcher.send("Debugger.setBreakpointByUrl", {
    urlRegex: "^chrome-extension://",
    lineNumber: 0,
    condition: `(() => {
      if (globalThis.watchingSends) return false;
      globalThis.watchingSends = true;
      const { dispatchEvent } = EventTarget.prototype;
      EventTarget.prototype.dispatchEvent = function (event) {
        reportSend(event.type);
        return dispatchEvent.call(this, event);
      };
      const { postMessage } = window;
      window.postMessage = function (...sent) {
        reportSend("message");
        return postMessage.apply(this, sent);
      };
      return false;
    })()`,
  });
  return sends;
}

const nameOf = (node: AxNode) => String(node.name?.value ?? "");
const propertyOf = (node: AxNode, name: string) =>
  node.properties?.find((property) => property.name === name)?.value.value;

/** The closed shadow roots hide from page scripts and Playwright's selectors, and not from the accessibility tree. */
async function findNode(session: CDPSession, role: string, name: RegExp): Promise<AxNode | null> {
  const nodes = await axNodes(session);
  return nodes.find((node) => node.role?.value === role && name.test(nameOf(node))) ?? null;
}

async function waitForNode(session: CDPSession, role: string, name: RegExp): Promise<AxNode> {
  for (const deadline = Date.now() + 10_000; Date.now() < deadline;) {
    const node = await findNode(session, role, name);
    if (node) return node;
    await Bun.sleep(50);
  }
  throw new Error(`timed out waiting for the ${role} named ${name}`);
}

async function clickNode(page: Page, session: CDPSession, node: AxNode): Promise<void> {
  const { model } = (await session.send("DOM.getBoxModel", {
    backendNodeId: node.backendDOMNodeId,
  })) as { model: { content: readonly number[] } };
  const between = (from: number, to: number) =>
    ((model.content[from] ?? 0) + (model.content[to] ?? 0)) / 2;
  await page.mouse.click(between(0, 4), between(1, 5));
}

async function openItem(
  id: number,
  opening: Page | null = null,
): Promise<{ page: Page; session: CDPSession }> {
  const page = opening ?? (await context.newPage());
  await page.addInitScript(() => {
    const seen: unknown[] = [];
    Object.assign(globalThis, { messagesToPage: seen });
    window.addEventListener("message", (event) => {
      seen.push(event.data);
    });
  });
  await page.goto(`${MFC}/item/${id}`);
  const session = await context.newCDPSession(page);
  await session.send("Accessibility.enable");
  await session.send("DOM.enable");
  await waitForNode(session, "button", /^Pick(ed)? for myakiba$/);
  return { page, session };
}

async function pick(page: Page, session: CDPSession): Promise<void> {
  const toggle = await waitForNode(session, "button", /^Pick for myakiba$/);
  await clickNode(page, session, toggle);
  await waitForNode(session, "button", /^Picked for myakiba$/);
}

async function storedKeys(worker: Worker): Promise<string[]> {
  const items = await worker.evaluate(() => chrome.storage.local.get(null));
  return Object.keys(items);
}

async function storedPick(worker: Worker, id: number) {
  const key = storedPickKey(id);
  const items = await worker.evaluate((name) => chrome.storage.local.get(name), key);
  const found = items[key];
  if (!found) throw new Error(`the extension stored no pick of ${id}`);
  return found;
}

const storedPickKey = (id: number) => `pick:n:default:${id}`;

async function openMyakiba(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${WEB}/`);
  const announce = await page.evaluate(() => globalThis.bridge.hello(5000));
  expect(announce?.type).toBe("announce");
  return page;
}

const pictureRequests = () => mocks.requests.filter((r) => r.path.startsWith("/?_tb=commit"));
const itemRequests = () => mocks.requests.filter((r) => r.path.startsWith("/item/"));

describe("picking on a mock MFC Item page", () => {
  test(
    "a page load makes no extension request and stores nothing, and neither it nor a click tells the page anything",
    async () => {
      const worker = await launch();

      const opening = await context.newPage();
      const sends = await watchSends(opening);
      const { page, session } = await openItem(GATED_ID, opening);
      await Bun.sleep(1000);

      expect(mocks.requests.map((request) => request.path)).toEqual([`/item/${GATED_ID}`]);
      const toggle = await waitForNode(session, "button", /^Pick for myakiba$/);
      expect(propertyOf(toggle, "pressed")).toBe("false");
      expect(await findNode(session, "link", /Review in myakiba/)).toBeNull();
      const stored = await storedKeys(worker);
      expect(stored.filter((key) => key.startsWith("pick:"))).toEqual([]);
      expect(await page.evaluate(() => globalThis.messagesToPage)).toEqual([]);
      expect(sends).toEqual([]);

      await pick(page, session);

      expect(sends).toEqual([]);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "the send watcher sees the myakiba content script announce itself, on myakiba's own page",
    async () => {
      await launch();
      const page = await context.newPage();
      const sends = await watchSends(page);

      await page.goto(`${WEB}/`);
      await Bun.sleep(1000);

      expect(
        sends.filter((sent) => sent.endsWith(":myakiba:wxt:content-script-started")),
      ).toHaveLength(1);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a click stores the scrubbed page and one picture, without loading the page again",
    async () => {
      const worker = await launch();
      const { page, session } = await openItem(GATED_ID);
      mocks.requests.length = 0;

      await pick(page, session);

      expect(pictureRequests().map((request) => request.path)).toEqual([
        `/?_tb=commit&commit=nsp&objectType=item&objectId=${GATED_ID}&size=1`,
      ]);
      expect(pictureRequests()[0]?.site).toBe("same-origin");
      expect(itemRequests()).toEqual([]);
      const stored = await storedPick(worker, GATED_ID);
      expect(stored.title).toContain("Hello, Good-bye");
      expect(stored.html).not.toContain("fixture_user");
      expect(stored.html).not.toContain("/profile/");
      expect(stored.html).not.toContain("Pick for myakiba");
      expect(stored.picture?.contentType).toBe("image/jpeg");
      const bytes = Uint8Array.fromBase64(stored.picture?.base64 ?? "");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(PICTURE_SHA256.gated);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "a public Item's picture comes from the same address",
    async () => {
      const worker = await launch();
      const { page, session } = await openItem(PUBLIC_ID);

      await pick(page, session);

      const stored = await storedPick(worker, PUBLIC_ID);
      const bytes = Uint8Array.fromBase64(stored.picture?.base64 ?? "");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(PICTURE_SHA256.public);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "the keyboard picks with Enter and unpicks with Space, and the note follows",
    async () => {
      const worker = await launch();
      const { page, session } = await openItem(GATED_ID);
      const toggle = await waitForNode(session, "button", /^Pick for myakiba$/);
      await session.send("DOM.focus", { backendNodeId: toggle.backendDOMNodeId });

      await page.keyboard.press("Enter");
      const picked = await waitForNode(session, "button", /^Picked for myakiba$/);
      expect(propertyOf(picked, "pressed")).toBe("true");
      expect(propertyOf(picked, "focused")).toBe(true);
      await waitForNode(session, "link", /^Review in myakiba$/);
      expect(await storedKeys(worker)).toContain(storedPickKey(GATED_ID));

      await page.keyboard.press("Space");
      await waitForNode(session, "button", /^Pick for myakiba$/);
      expect(await findNode(session, "link", /Review in myakiba/)).toBeNull();
      expect(await storedKeys(worker)).not.toContain(storedPickKey(GATED_ID));
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "the keyboard stays on Pick through an SFW refusal, reaches Dismiss with Tab and returns to Pick",
    async () => {
      await launch();
      const { page, session } = await openItem(SFW_ID);
      const toggle = await waitForNode(session, "button", /^Pick for myakiba$/);
      await session.send("DOM.focus", { backendNodeId: toggle.backendDOMNodeId });

      await page.keyboard.press("Enter");
      await waitForNode(session, "alert", /^/);
      const stayed = await waitForNode(session, "button", /^Pick for myakiba$/);
      expect(propertyOf(stayed, "focused")).toBe(true);

      await page.keyboard.press("Tab");
      const dismiss = await waitForNode(session, "button", /^Dismiss$/);
      expect(propertyOf(dismiss, "focused")).toBe(true);

      await page.keyboard.press("Enter");
      expect(await findNode(session, "alert", /^/)).toBeNull();
      const back = await waitForNode(session, "button", /^Pick for myakiba$/);
      expect(propertyOf(back, "focused")).toBe(true);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "the myakiba page collects the picks, and only picks-saved deletes them",
    async () => {
      const worker = await launch();
      const gated = await openItem(GATED_ID);
      await pick(gated.page, gated.session);
      const shown = await openItem(PUBLIC_ID);
      await pick(shown.page, shown.session);
      mocks.requests.length = 0;

      const myakiba = await openMyakiba();
      const taken = await myakiba.evaluate(() => globalThis.bridge.takePicks());

      expect(taken.map((one) => one.mfcItemId)).toEqual([GATED_ID, PUBLIC_ID]);
      expect(taken.every((one) => (one.pictureBytes ?? 0) > 0)).toBe(true);
      expect(mocks.requests.filter((request) => request.origin === MFC)).toEqual([]);
      expect(await storedKeys(worker)).toContain(storedPickKey(GATED_ID));

      const reason = await myakiba.evaluate(() => globalThis.bridge.picksSaved([98_777]));
      expect(reason).toBe("complete");
      const left = await storedKeys(worker);
      expect(left).not.toContain(storedPickKey(GATED_ID));
      expect(left).toContain(storedPickKey(PUBLIC_ID));

      await gated.page.reload();
      await waitForNode(gated.session, "button", /^Pick for myakiba$/);
      await waitForNode(gated.session, "link", /^Review in myakiba$/);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "the note's link opens the Add page, and only the named tab, with no tabs API",
    async () => {
      await launch();
      const { page, session } = await openItem(GATED_ID);
      await pick(page, session);
      const link = await waitForNode(session, "link", /^Review in myakiba$/);

      const [opened] = await Promise.all([
        context.waitForEvent("page"),
        clickNode(page, session, link),
      ]);
      await opened.waitForLoadState();
      expect(opened.url()).toBe(`${WEB}/add?from=mfc`);
      const before = context.pages().length;

      await page.bringToFront();
      await clickNode(page, session, link);
      await Bun.sleep(500);

      expect(context.pages()).toHaveLength(before);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "going Back to an Item shows the picks made since",
    async () => {
      await launch({ backForwardCache: true });
      const { page, session } = await openItem(GATED_ID);
      await pick(page, session);

      await page.evaluate(() => {
        window.addEventListener("pageshow", (event) => {
          document.documentElement.dataset["restored"] = String(event.persisted);
        });
      });
      await page.goto(`${MFC}/item/${PUBLIC_ID}`);
      await pick(page, session);

      await page.goBack({ waitUntil: "commit" });

      await page.waitForFunction(() => document.documentElement.dataset["restored"] === "true");
      await waitForNode(session, "StaticText", /^2 picked · $/);
      await waitForNode(session, "button", /^Picked for myakiba$/);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test("the built Pick script holds no way to send the page anything", async () => {
    const script = (file: string) => Bun.file(path.join(EXTENSION, file)).text();

    expect(await script("content-scripts/myakiba.js")).toContain("content-script-started");
    const pickScript = await script("mfc.js");
    for (const send of ["content-script-started", "wxt:", "dispatchEvent", "postMessage"]) {
      expect(pickScript).not.toContain(send);
    }
  });

  test("the build asks the browser for nothing new", async () => {
    const manifest = manifestSchema.parse(
      await Bun.file(path.join(EXTENSION, "manifest.json")).json(),
    );
    const toProduction = (entry: string) =>
      entry
        .replace(MFC, "https://myfigurecollection.net")
        .replace(E2E_ORIGINS.WXT_MFC_STATIC_ORIGIN, "https://static.myfigurecollection.net")
        .replace(WEB, "https://myakiba.app");

    expect(
      checkManifest(
        {
          ...manifest,
          host_permissions: manifest.host_permissions.map(toProduction),
          content_scripts: manifest.content_scripts.map((script) => ({
            matches: script.matches.map(toProduction),
          })),
        },
        "chrome",
      ),
    ).toEqual([]);
    expect(manifest.permissions.toSorted()).toEqual(["scripting", "storage"]);
    expect(manifest.optional_permissions).toEqual([]);
  });
});
