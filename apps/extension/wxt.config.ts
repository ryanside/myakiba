import { env } from "@myakiba/env/extension";
import { defineConfig } from "wxt";
import { assertReleaseOrigins } from "./lib/release-profile";

export default defineConfig({
  imports: false,
  manifest: ({ browser, mode, command }) => {
    assertReleaseOrigins({ mode, command }, env);
    const firefox = browser === "firefox";
    return {
      name: "myakiba",
      description:
        "Brings MyFigureCollection items into myakiba with your MyFigureCollection session.",
      permissions: ["scripting", "storage"],
      host_permissions: [`${env.WXT_MFC_ORIGIN}/*`, `${env.WXT_MFC_STATIC_ORIGIN}/*`],
      // Uint8Array.fromBase64 and toBase64.
      ...(firefox
        ? { browser_specific_settings: { gecko: { strict_min_version: "133.0" } } }
        : { minimum_chrome_version: "140" }),
    };
  },
});
