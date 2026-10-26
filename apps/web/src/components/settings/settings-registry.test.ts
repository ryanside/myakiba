import { expect, test } from "bun:test";
import { searchSettings } from "./settings-registry";

function resultIds(query: string) {
  return searchSettings(query).flatMap((group) => group.settings);
}

test("a search matches titles, keywords and descriptions, whatever their case", () => {
  expect(resultIds("Currency")).toContain("currency");
  expect(resultIds("yen")).toEqual(["currency"]);
  expect(resultIds("json")).toEqual(["export", "import"]);
});

test("every word of a search must match the same setting", () => {
  expect(resultIds("date format")).toEqual(["date-format"]);
  expect(resultIds("date password")).toEqual([]);
});

test("results group by section in nav order, and a title match outranks a description match", () => {
  const groups = searchSettings("account");
  expect(groups.map((group) => group.section)).toEqual(["account", "data-transfer"]);
  expect(groups[0]?.settings[0]).toBe("delete-account");
});

test("a blank search finds nothing", () => {
  expect(searchSettings("   ")).toEqual([]);
});
