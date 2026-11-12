import { describe, expect, test } from "bun:test";
import { checkManifest, EXPECTED_MANIFEST } from "./manifest-policy";
import type { Manifest, ManifestBrowser } from "./manifest-policy";

const BROWSERS = ["chrome", "firefox"] as const;

type Field = keyof (typeof EXPECTED_MANIFEST)[ManifestBrowser];
const FIELDS: readonly Field[] = ["permissions", "hostPermissions", "contentScriptMatches"];

function fieldOf(entry: string, name: string): Field {
  if (entry.startsWith("Content script on")) return "contentScriptMatches";
  return name.startsWith("https://") ? "hostPermissions" : "permissions";
}

/** What STORE.md's permissions table lists for a browser, by the manifest field each row fills. */
async function storeListing(browser: ManifestBrowser): Promise<Record<Field, string[]>> {
  const store = await Bun.file(new URL("../STORE.md", import.meta.url)).text();
  const table = store.split("## Permissions")[1]?.split("\n\n")[1] ?? "";
  const rows = table
    .split("\n")
    .slice(2)
    .map((row) => {
      const [entry = "", browsers = ""] = row
        .split("|")
        .slice(1)
        .map((cell) => cell.trim());
      const name = entry.match(/`([^`]+)`/)?.[1] ?? "";
      return { field: fieldOf(entry, name), name, browsers };
    })
    .filter((row) => row.browsers.includes(browser === "chrome" ? "Chrome" : "Firefox"));
  return Object.fromEntries(
    FIELDS.map((field) => [
      field,
      rows.filter((row) => row.field === field).map((row) => row.name),
    ]),
  ) as Record<Field, string[]>;
}

const sorted = (policy: Readonly<Record<string, readonly string[]>>) =>
  Object.fromEntries(Object.entries(policy).map(([field, entries]) => [field, entries.toSorted()]));

function built(browser: ManifestBrowser): Manifest {
  const policy = EXPECTED_MANIFEST[browser];
  return {
    permissions: [...policy.permissions],
    host_permissions: [...policy.hostPermissions],
    content_scripts: [{ matches: [...policy.contentScriptMatches] }],
  };
}

describe("the manifest policy", () => {
  test.each(BROWSERS)("allows %s exactly what STORE.md lists", async (browser) => {
    expect(sorted(EXPECTED_MANIFEST[browser])).toEqual(sorted(await storeListing(browser)));
  });

  test.each(BROWSERS)("passes a %s manifest that asks for what it allows", (browser) => {
    expect(checkManifest(built(browser), browser)).toEqual([]);
  });

  test("names each permission, host or content script a manifest adds or drops", () => {
    const manifest = built("chrome");

    expect(
      checkManifest(
        {
          ...manifest,
          permissions: ["scripting", "storage", "tabs"],
          optional_permissions: ["history"],
          host_permissions: ["https://myfigurecollection.net/*"],
          optional_host_permissions: ["<all_urls>"],
          content_scripts: [
            { matches: ["https://myakiba.app/*", "https://myfigurecollection.net/item/*"] },
            { matches: ["https://myfigurecollection.net/*"] },
          ],
        },
        "chrome",
      ),
    ).toEqual([
      "the chrome permissions include tabs, which STORE.md does not list",
      "the chrome optional permissions include history, which STORE.md does not list",
      "the chrome host permissions lack https://static.myfigurecollection.net/*, which STORE.md lists",
      "the chrome optional host permissions include <all_urls>, which STORE.md does not list",
      "the chrome content scripts include https://myfigurecollection.net/*, which STORE.md does not list",
    ]);
  });

  test("refuses Chrome the cookies permission that only Firefox needs", () => {
    expect(checkManifest(built("firefox"), "chrome")).toEqual([
      "the chrome permissions include cookies, which STORE.md does not list",
    ]);
  });
});

describe("the manifest policy refuses ways to reach the extension or the page it runs in", () => {
  test.each(BROWSERS)("%s: names each one a manifest adds", (browser) => {
    const manifest = built(browser);

    expect(
      checkManifest(
        {
          ...manifest,
          externally_connectable: { matches: ["https://myakiba.app/*"] },
          web_accessible_resources: [{ resources: ["picture.html"], matches: ["<all_urls>"] }],
          content_security_policy: { extension_pages: "script-src 'self'" },
          content_scripts: [
            { matches: ["https://myakiba.app/*"], all_frames: true },
            { matches: ["https://myfigurecollection.net/item/*"], world: "MAIN" },
          ],
        },
        browser,
      ),
    ).toEqual([
      `the ${browser} manifest sets externally_connectable, which lets other extensions and sites message this one`,
      `the ${browser} manifest sets web_accessible_resources, which lets pages load the extension's files`,
      `the ${browser} manifest sets content_security_policy, which replaces the browser's default CSP for the extension`,
      `the ${browser} content script on https://myakiba.app/* runs in all frames, not only the top one`,
      `the ${browser} content script on https://myfigurecollection.net/item/* runs in the page's MAIN world`,
    ]);
  });

  test.each(BROWSERS)("%s: passes an empty web_accessible_resources list", (browser) => {
    expect(checkManifest({ ...built(browser), web_accessible_resources: [] }, browser)).toEqual([]);
  });
});
