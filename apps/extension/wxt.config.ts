import { fileURLToPath } from "node:url";
import { EXTENSION_MIN_BROWSER_VERSION } from "@myakiba/contracts/shared/extension-browsers";
import { env } from "@myakiba/env/extension";
import { defineConfig } from "wxt";
import { assertReleaseOrigins } from "./lib/release-profile";

export default defineConfig({
  imports: false,
  manifestVersion: 3,
  manifest: ({ browser, mode, command }) => {
    assertReleaseOrigins({ mode, command }, env);
    const firefox = browser === "firefox";
    return {
      name: "myakiba",
      description:
        "Brings MyFigureCollection items into myakiba with your MyFigureCollection session.",
      homepage_url: env.WXT_WEB_ORIGIN,
      // Firefox needs "cookies" to open the MFC tab in the requesting tab's container.
      permissions: firefox ? ["scripting", "storage", "cookies"] : ["scripting", "storage"],
      host_permissions: [`${env.WXT_MFC_ORIGIN}/*`, `${env.WXT_MFC_STATIC_ORIGIN}/*`],
      // Uint8Array.fromBase64 and toBase64 need Chrome 140. Firefox 140 also shows the data consent declared here.
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: "extension@myakiba.app",
                strict_min_version: `${EXTENSION_MIN_BROWSER_VERSION}.0`,
                data_collection_permissions: { required: ["websiteContent"] },
              },
            },
          }
        : { minimum_chrome_version: String(EXTENSION_MIN_BROWSER_VERSION) }),
    };
  },
  zip: {
    name: "myakiba",
    // The build needs the workspace packages and the root lockfile, so the sources come from the repo root.
    sourcesRoot: fileURLToPath(new URL("../..", import.meta.url)),
    includeSources: [
      "package.json",
      "bun.lock",
      "apps/*/package.json",
      "packages/*/package.json",
      "apps/extension/**",
      "packages/{config,contracts,env,mfc,utils}/**",
    ],
    excludeSources: [
      "apps/extension/{e2e,test}/**",
      "packages/mfc/{fixtures,test}/**",
      "**/*.type-test.ts",
      "**/dist/**",
    ],
  },
});
