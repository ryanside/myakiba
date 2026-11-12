import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { ORIGINS } from "../lib/config";
import { pageFetchOf } from "../lib/mfc-page/page-fetch";
import type { ContentGlobal } from "../lib/mfc-page/page-fetch";
import { startMfcPicking } from "../lib/mfc-page/start";

// wxt.config.ts declares this content script. WXT wraps a .content.ts one in a context that dispatches an event MFC's
// own scripts can see on every load, and no option turns that off.
export default defineUnlistedScript(() => {
  startMfcPicking({
    window,
    runtime: browser.runtime,
    fetch: pageFetchOf(globalThis as ContentGlobal, (url, init) => fetch(url, init)),
    origins: ORIGINS,
  });
});
