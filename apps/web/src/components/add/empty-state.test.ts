import { describe, expect, test } from "bun:test";
import { emptyMessage } from "./empty-state";

const LISTED = { kind: "listed", store: "firefoxAddons", url: "https://addons.example" } as const;
const IN_REVIEW = { kind: "in_review", store: "chromeWebStore" } as const;
const UNSUPPORTED = { kind: "unsupported" } as const;

describe("what an empty Add page says", () => {
  test.each(["ready", "outdated"] as const)("with the extension %s, how to pick", (status) => {
    expect(emptyMessage(status, IN_REVIEW)).toEqual({
      body: "Click Pick for myakiba on any MyFigureCollection item and it lands here.",
      action: {
        kind: "external",
        label: "Search MyFigureCollection",
        href: "https://myfigurecollection.net/?_tb=item&keywords=",
      },
    });
  });

  test("without it, where a browser's store lists it, how to install it", () => {
    expect(emptyMessage("absent", LISTED)).toEqual({
      body: "Picking new items needs the myakiba extension. Anything already in the Item Database can be added without it.",
      action: {
        kind: "external",
        label: "Install from Firefox Add-ons",
        href: "https://addons.example",
      },
    });
  });

  test("without it, while a store reviews it, what still works", () => {
    expect(emptyMessage("absent", IN_REVIEW)).toEqual({
      body: "The myakiba extension is in review at the Chrome Web Store, so new items can't be picked yet. Anything already in the Item Database can be added now.",
      action: { kind: "open-search", label: "Search the Item Database" },
    });
  });

  test("without it, in a browser it does not run in, which ones it does", () => {
    expect(emptyMessage("absent", UNSUPPORTED)).toEqual({
      body: "Picking new items needs the myakiba extension, on desktop Chrome or Firefox. Anything already in the Item Database can be added here.",
      action: { kind: "open-search", label: "Search the Item Database" },
    });
  });
});
