import path from "node:path";
import { Window as HappyWindow } from "happy-dom";
import { ORIGINS, fakeStorageArea } from "./fake-browser";
import { pickListener } from "../lib/pick-host";
import type { MfcPageRequest, MfcPageState } from "../lib/pick-host";
import { createPicks } from "../lib/picks";
import type { PortSender } from "../lib/port-host";

const FIXTURES = path.join(import.meta.dir, "../../../packages/mfc/fixtures");

export const ITEM_98777 = await Bun.file(path.join(FIXTURES, "item-98777.html")).text();
export const PUBLIC_ITEM = await Bun.file(path.join(FIXTURES, "derived-public-item.html")).text();

export function edit(html: string, from: string, to: string): string {
  if (!html.includes(from)) throw new Error(`fixture has no ${from}`);
  return html.replace(from, to);
}

type PageWindow = Window & typeof globalThis & { readonly happyDOM: HappyWindow["happyDOM"] };

export type MfcTestPage = {
  readonly window: PageWindow;
  readonly document: Document;
  /** Shadow roots are closed, as on MFC, so a test reaches them only through what attachShadow returned. */
  readonly root: (name: "toggle" | "note") => ShadowRoot;
  readonly toggle: () => HTMLButtonElement;
};

// happy-dom shares its element classes between windows, so the wrapper goes on once.
const wrapped = new WeakSet<object>();
const rootOf = new WeakMap<Element, ShadowRoot>();

/** A page in happy-dom whose scripts do not run, with each shadow root it attaches kept for the test. */
export function pageAt(html: string, pathname = "/item/98777"): MfcTestPage {
  const window: PageWindow = new HappyWindow({
    url: `${ORIGINS.mfc}${pathname}`,
    settings: {
      disableJavaScriptFileLoading: true,
      disableJavaScriptEvaluation: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
    },
  }) as never;
  const prototype = window.Element.prototype;
  if (!wrapped.has(prototype)) {
    wrapped.add(prototype);
    const attach = prototype.attachShadow;
    prototype.attachShadow = function attachShadow(init) {
      const root = attach.call(this, init);
      rootOf.set(this, root);
      return root;
    };
  }
  window.document.write(html);
  const root = (name: string) => {
    const host = window.document.querySelector(`[data-myakiba-pick="${name}"]`);
    const found = host && rootOf.get(host);
    if (!found) throw new Error(`nothing mounted a ${name} root`);
    return found;
  };
  return {
    window,
    document: window.document,
    root,
    toggle: () => {
      const button = root("toggle").querySelector("button");
      if (!button) throw new Error("the toggle has no button");
      return button;
    },
  };
}

/** The real background pick host and store behind `runtime.sendMessage`, with what the page sent recorded. */
export function fakeBackground(options: { localQuota?: number; pathname?: string } = {}) {
  const local = fakeStorageArea(options.localQuota);
  const picks = createPicks({
    local: local.area,
    session: fakeStorageArea().area,
    clock: { now: () => 1 },
  });
  const listener = pickListener(picks, { extensionId: "ours", mfcOrigin: ORIGINS.mfc });
  const sender: PortSender = {
    id: "ours",
    frameId: 0,
    origin: ORIGINS.mfc,
    url: `${ORIGINS.mfc}${options.pathname ?? "/item/98777"}`,
    tab: { id: 4, incognito: false },
  };
  const sent: MfcPageRequest[] = [];
  return {
    sent,
    picks,
    local,
    runtime: {
      // Chrome settles with no answer when the listener drops a message.
      sendMessage: async (message: MfcPageRequest): Promise<MfcPageState | undefined> => {
        sent.push(message);
        const answer = Promise.withResolvers<MfcPageState>();
        if (listener(message, sender, answer.resolve)) return answer.promise;
      },
    },
  };
}

export async function settled(page: MfcTestPage): Promise<void> {
  for (let round = 0; round < 20; round++) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  await page.window.happyDOM.waitUntilComplete();
}
