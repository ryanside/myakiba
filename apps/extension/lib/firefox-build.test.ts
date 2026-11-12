import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { parseJson } from "@myakiba/utils/parse-json";
import { manifestSchema } from "./manifest-policy";
import type { Manifest } from "./manifest-policy";

const ROOT = path.join(import.meta.dir, "..");
const ORIGINS = {
  WXT_WEB_ORIGIN: "http://localhost:3001",
  WXT_MFC_ORIGIN: "http://127.0.0.1:4601",
  WXT_MFC_STATIC_ORIGIN: "http://127.0.0.1:4602",
} as const;

/**
 * How Firefox matches a URL: a pattern whose host carries a port matches nothing, so its content script never runs
 * (https://bugzil.la/1362809, https://bugzil.la/1468162).
 */
function firefoxMatches(pattern: string, url: string): boolean {
  const parts = /^(?<scheme>[a-z]+):\/\/(?<host>[^/]+)(?<path>\/.*)$/u.exec(pattern)?.groups;
  if (!parts?.scheme || !parts.host || !parts.path || parts.host.includes(":")) return false;
  const target = new URL(url);
  const glob = new RegExp(`^${parts.path.split("*").map(RegExp.escape).join(".*")}$`, "u");
  return (
    `${parts.scheme}:` === target.protocol &&
    parts.host === target.hostname &&
    glob.test(`${target.pathname}${target.search}`)
  );
}

const OUTPUT = path.join(ROOT, ".output/firefox-mv3-e2e");

let manifest: Manifest;

beforeAll(async () => {
  const build = Bun.spawnSync(["bunx", "wxt", "build", "-b", "firefox", "--mode", "e2e"], {
    cwd: ROOT,
    env: { ...process.env, ...ORIGINS },
  });
  if (build.exitCode !== 0) throw new Error(`the Firefox build failed\n${build.stderr.toString()}`);
  const built = await Bun.file(path.join(OUTPUT, "manifest.json")).text();
  manifest = parseJson(manifestSchema, built).unwrap();
});

describe("a Firefox build for origins with ports", () => {
  const scriptsOn = (url: string) =>
    (manifest.content_scripts ?? []).filter((script) =>
      (script.matches ?? []).some((pattern) => firefoxMatches(pattern, url)),
    );

  test("runs the page bridge on the myakiba Add page", () => {
    expect(scriptsOn(`${ORIGINS.WXT_WEB_ORIGIN}/add?from=mfc`)).toHaveLength(1);
  });

  test("runs the Pick script on an MFC Item page", () => {
    expect(scriptsOn(`${ORIGINS.WXT_MFC_ORIGIN}/item/2336325`)).toHaveLength(1);
  });

  test("may reach MFC and its pictures", () => {
    const reaches = (url: string) =>
      (manifest.host_permissions ?? []).some((pattern) => firefoxMatches(pattern, url));
    expect(reaches(`${ORIGINS.WXT_MFC_ORIGIN}/item/2336325`)).toBe(true);
    expect(reaches(`${ORIGINS.WXT_MFC_STATIC_ORIGIN}/upload/items/1/2336325.jpg`)).toBe(true);
  });
});
