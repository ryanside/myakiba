// Checks the built manifests ask for exactly what lib/manifest-policy.ts allows. Run it after `bun run zip`.
import { fileURLToPath } from "node:url";
import { parseJson } from "@myakiba/utils/parse-json";
import { checkManifest, manifestSchema } from "../lib/manifest-policy";
import type { ManifestBrowser } from "../lib/manifest-policy";

const BUILDS = {
  chrome: "../.output/chrome-mv3/manifest.json",
  firefox: "../.output/firefox-mv3/manifest.json",
} as const satisfies Record<ManifestBrowser, string>;

let failed = false;
for (const browser of ["chrome", "firefox"] as const) {
  const file = Bun.file(fileURLToPath(new URL(BUILDS[browser], import.meta.url)));
  if (!(await file.exists())) {
    console.error(`${file.name} is missing, so run bun run zip first`);
    failed = true;
    continue;
  }
  const manifest = parseJson(manifestSchema, await file.text());
  if (manifest.isErr()) {
    console.error(`${file.name} is not a manifest: ${manifest.error.message}`);
    failed = true;
    continue;
  }
  const problems = checkManifest(manifest.value, browser);
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`the ${browser} manifest asks for what STORE.md lists`);
  failed ||= problems.length > 0;
}
if (failed) process.exitCode = 1;
