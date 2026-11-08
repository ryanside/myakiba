import { PRODUCTION_EXTENSION_ORIGINS } from "@myakiba/env/extension";
import * as z from "zod";

export type ManifestBrowser = "chrome" | "firefox";

type ManifestPolicy = {
  readonly permissions: readonly string[];
  readonly hostPermissions: readonly string[];
  readonly contentScriptMatches: readonly string[];
};

const {
  WXT_WEB_ORIGIN: WEB,
  WXT_MFC_ORIGIN: MFC,
  WXT_MFC_STATIC_ORIGIN: MFC_STATIC,
} = PRODUCTION_EXTENSION_ORIGINS;

const HOSTS = [`${MFC}/*`, `${MFC_STATIC}/*`];
const CONTENT_SCRIPTS = [`${WEB}/*`, `${MFC}/item/*`];

/**
 * What a release build may ask the browser for, as `STORE.md` lists it for the store forms. Adding an entry here needs
 * that file changed with it and a person's review.
 */
export const EXPECTED_MANIFEST = {
  chrome: {
    permissions: ["scripting", "storage"],
    hostPermissions: HOSTS,
    contentScriptMatches: CONTENT_SCRIPTS,
  },
  firefox: {
    permissions: ["scripting", "storage", "cookies"],
    hostPermissions: HOSTS,
    contentScriptMatches: CONTENT_SCRIPTS,
  },
} as const satisfies Record<ManifestBrowser, ManifestPolicy>;

const strings = z.array(z.string()).default([]);

export const manifestSchema = z.object({
  permissions: strings,
  optional_permissions: strings,
  host_permissions: strings,
  optional_host_permissions: strings,
  content_scripts: z.array(z.object({ matches: strings })).default([]),
});
export type Manifest = z.input<typeof manifestSchema>;

function differences(
  what: string,
  actual: readonly string[],
  expected: readonly string[],
): string[] {
  return [
    ...actual
      .filter((entry) => !expected.includes(entry))
      .map((entry) => `${what} include ${entry}, which STORE.md does not list`),
    ...expected
      .filter((entry) => !actual.includes(entry))
      .map((entry) => `${what} lack ${entry}, which STORE.md lists`),
  ];
}

/** Each way a built manifest asks for more or less than the policy allows. */
export function checkManifest(manifest: Manifest, browser: ManifestBrowser): string[] {
  const built = manifestSchema.parse(manifest);
  const expected = EXPECTED_MANIFEST[browser];
  return [
    ...differences(`the ${browser} permissions`, built.permissions, expected.permissions),
    ...differences(`the ${browser} optional permissions`, built.optional_permissions, []),
    ...differences(
      `the ${browser} host permissions`,
      built.host_permissions,
      expected.hostPermissions,
    ),
    ...differences(`the ${browser} optional host permissions`, built.optional_host_permissions, []),
    ...differences(
      `the ${browser} content scripts`,
      built.content_scripts.flatMap((script) => script.matches),
      expected.contentScriptMatches,
    ),
  ];
}
