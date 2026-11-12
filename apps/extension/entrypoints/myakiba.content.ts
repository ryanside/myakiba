import { env } from "@myakiba/env/extension";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { startPageBridge } from "../lib/page-bridge";

export default defineContentScript({
  matches: [`${env.WXT_WEB_ORIGIN}/*`],
  runAt: "document_start",
  allFrames: false,
  main() {
    startPageBridge({
      page: window,
      origin: env.WXT_WEB_ORIGIN,
      runtime: {
        connect: () => browser.runtime.connect({ name: "myakiba-bridge" }),
        version: () => browser.runtime.getManifest().version,
        alive: () => browser.runtime?.id !== undefined,
      },
      repeat: (ms, tick) => {
        const timer = setInterval(tick, ms);
        return () => clearInterval(timer);
      },
    });
  },
});
