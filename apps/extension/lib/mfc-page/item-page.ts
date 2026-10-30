import { MAX_PICK_TITLE, mfcItemUrl } from "@myakiba/contracts/add/constants";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";

export type ItemOnPage = { readonly mfcItemId: MfcItemId; readonly title: string | null };

const ITEM_PATH = /^\/item\/(\d+)\/?$/;
// The same class also marks the Prev/Next nav, which is no place for an action.
const ACTION_BAR = ".content-meta .content-actions.desktop:not(nav)";

export function itemIdOfPath(pathname: string): MfcItemId | null {
  const id = ITEM_PATH.exec(pathname)?.[1];
  return id === undefined ? null : mfcItemId(Number(id));
}

/** The Item this page is about, when its address and its canonical link agree. */
export function itemOnPage(doc: Document, location: Pick<Location, "pathname">): ItemOnPage | null {
  const id = itemIdOfPath(location.pathname);
  if (id === null) return null;
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (canonical !== mfcItemUrl(id)) return null;
  const title = doc.querySelector("h1.title")?.textContent.trim().slice(0, MAX_PICK_TITLE);
  return { mfcItemId: id, title: title || null };
}

/** Puts the toggle last in MFC's action bar while the bar shows, else floating over the page. Safe to call repeatedly. */
export function placeToggle(doc: Document, host: HTMLElement): void {
  const bar = doc.querySelector(ACTION_BAR);
  const shown = bar?.checkVisibility() === true;
  host.toggleAttribute("data-floating", !shown);
  const parent = shown ? bar : doc.body;
  if (host.parentElement !== parent || host.nextElementSibling !== null) parent.append(host);
}

/** Keeps the toggle placed when MFC rewrites its header or the window crosses MFC's mobile layout. */
export function keepToggleInPlace(window: Window & typeof globalThis, host: HTMLElement): void {
  const doc = window.document;
  const place = () => placeToggle(doc, host);
  place();
  window.addEventListener("resize", place);
  const meta = doc.querySelector(".content-meta");
  if (!meta) return;
  new window.MutationObserver(place).observe(meta, { childList: true, subtree: true });
}
