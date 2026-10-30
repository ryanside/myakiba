import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import type * as z from "zod";
import { PickStoreFull } from "./errors/pick-store-full";
import { fromMfcPageSchema } from "./messages";
import type { mfcPageStateSchema } from "./messages";
import type { Picks } from "./picks";
import type { PortSender } from "./port-host";
import type { TabContext } from "./queue";

export type MfcPageState = z.output<typeof mfcPageStateSchema>;

export type MfcPageRequest = z.output<typeof fromMfcPageSchema>;

type ItemPageSender = { readonly mfcItemId: MfcItemId; readonly context: TabContext };

const ITEM_PATH = /^\/item\/(\d+)\/?$/;

/** The top frame of an MFC Item page in a tab of known browsing context, or null for any other sender. */
function itemPageSender(
  sender: PortSender,
  expected: { readonly extensionId: string; readonly mfcOrigin: string },
): ItemPageSender | null {
  if (sender.id !== expected.extensionId || sender.frameId !== 0) return null;
  const url = URL.parse(sender.url ?? "");
  // Firefox gives no sender.origin.
  const origin = sender.origin ?? url?.origin;
  const id = url?.pathname.match(ITEM_PATH)?.[1];
  const tab = sender.tab;
  if (origin !== expected.mfcOrigin || id === undefined || tab?.incognito === undefined) {
    return null;
  }
  const page = mfcItemId(Number(id));
  if (page === null) return null;
  return {
    mfcItemId: page,
    context: { incognito: tab.incognito, cookieStoreId: tab.cookieStoreId ?? null },
  };
}

/** The Item a message is about. A page may only pick or unpick its own. */
function itemNamed(request: MfcPageRequest, page: ItemPageSender): MfcItemId {
  switch (request.type) {
    case "mfc-hello":
      return page.mfcItemId;
    case "mfc-pick":
      return request.capture.mfcItemId;
    case "mfc-unpick":
      return request.mfcItemId;
  }
}

/**
 * A `runtime.onMessage` listener for the MFC content script. It answers each message with the page's state for the
 * sender's context, through `sendResponse`, and drops a message from any other sender or about any other Item.
 */
export function pickListener(
  picks: Picks,
  expected: { readonly extensionId: string; readonly mfcOrigin: string },
) {
  async function answer(
    message: MfcPageRequest,
    page: ItemPageSender,
  ): Promise<MfcPageState | null> {
    let refused: MfcPageState["refused"] = null;
    if (message.type === "mfc-pick") {
      const added = await picks.add(page.context, message.capture);
      if (added.isErr()) {
        console.warn(`${added.error._tag}: ${added.error.message}`);
        refused = PickStoreFull.is(added.error) ? "full" : "storage_failed";
      }
    } else if (message.type === "mfc-unpick") {
      const removed = await picks.remove(page.context, [message.mfcItemId]);
      if (removed.isErr()) console.warn(`${removed.error._tag}: ${removed.error.message}`);
    }
    const state = await picks.state(page.context, page.mfcItemId);
    if (state.isErr()) {
      console.warn(`${state.error._tag}: ${state.error.message}`);
      return null;
    }
    return { ...state.value, full: state.value.full || refused === "full", refused };
  }

  return (
    message: MfcPageRequest,
    sender: PortSender,
    sendResponse: (state: MfcPageState) => void,
  ): boolean => {
    const page = itemPageSender(sender, expected);
    const parsed = fromMfcPageSchema.safeParse(message);
    if (page === null || !parsed.success) return false;
    const request = parsed.data;
    if (itemNamed(request, page) !== page.mfcItemId) return false;
    void (async () => {
      try {
        const state = await answer(request, page);
        if (state !== null) sendResponse(state);
      } catch (error) {
        console.error("could not answer an MFC page", error);
      }
    })();
    // Chrome keeps the reply open only when the listener returns true.
    return true;
  };
}
