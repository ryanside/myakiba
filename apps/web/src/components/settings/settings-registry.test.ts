import { expect, test } from "bun:test";
import { searchSettings } from "./settings-registry";

function resultIds(query: string) {
  return searchSettings(query).flatMap((group) => group.settings);
}

test("a search matches titles, keywords and descriptions, whatever their case", () => {
  expect(resultIds("Currency")).toContain("currency");
  expect(resultIds("yen")).toEqual(["currency"]);
  expect(resultIds("pixel")).toEqual(["page-backgrounds"]);
});

test("every word of a search must match the same setting", () => {
  expect(resultIds("date format")).toEqual(["date-format"]);
  expect(resultIds("date password")).toEqual([]);
});

test("results group by section in nav order, and a title match outranks a description match", () => {
  const groups = searchSettings("device");
  expect(groups.map((group) => group.section)).toEqual(["appearance", "account"]);
  expect(groups[1]?.settings).toEqual(["devices", "sign-out-others"]);
});

test("a blank search finds nothing", () => {
  expect(searchSettings("   ")).toEqual([]);
});
