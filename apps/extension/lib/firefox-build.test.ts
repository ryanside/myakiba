import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { parseJson } from "@myakiba/utils/parse-json";
import { manifestSchema } from "./manifest-policy";
import type { Manifest } from "./manifest-policy";
import { firefoxMatches } from "../test/firefox-match";

const ROOT = path.join(import.meta.dir, "..");
const ORIGINS = {
  WXT_WEB_ORIGIN: "http://localhost:3001",
  WXT_MFC_ORIGIN: "http://127.0.0.1:4601",
  WXT_MFC_STATIC_ORIGIN: "http://127.0.0.1:4602",
} as const;

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

  test("lists each host permission once", () => {
    const permissions = manifest.host_permissions ?? [];

    expect(permissions).toEqual([...new Set(permissions)]);
  });
});
