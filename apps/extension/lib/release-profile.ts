import { PRODUCTION_EXTENSION_ORIGINS } from "@myakiba/env/extension";

type Build = { readonly mode: string; readonly command: "build" | "serve" };

/** A release must talk to the real myakiba and MFC, so only dev and the e2e build may point elsewhere. */
export function assertReleaseOrigins(
  build: Build,
  origins: Readonly<Record<string, string>>,
): void {
  if (build.command === "serve" || build.mode === "e2e") return;
  const changed = Object.entries(PRODUCTION_EXTENSION_ORIGINS)
    .filter(([name, production]) => origins[name] !== production)
    .map(([name]) => name);
  if (changed.length > 0) {
    throw new Error(
      `a ${build.mode} build must use the production origins, but ${changed.join(", ")} changed. Build with --mode e2e to test against other origins.`,
    );
  }
}
