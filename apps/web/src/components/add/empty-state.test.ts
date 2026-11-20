import { describe, expect, test } from "bun:test";
import { emptyMessage } from "./empty-state";

const LISTED = { kind: "listed", store: "firefoxAddons", url: "https://addons.example" } as const;
const IN_REVIEW = { kind: "in_review", store: "chromeWebStore", alternative: null } as const;
const UNSUPPORTED = { kind: "unsupported" } as const;

describe("what an empty Add page says", () => {
  test.each(["ready", "outdated"] as const)("with the extension %s, how to pick", (status) => {
    expect(emptyMessage(status, IN_REVIEW)).toEqual({
      body: "Click Pick for myakiba on any MyFigureCollection item and it lands here.",
      link: null,
    });
  });

  test("without it, where a browser's store lists it, how to install it", () => {
    expect(emptyMessage("absent", LISTED)).toEqual({
      body: "Install the myakiba extension, then click Pick for myakiba on any MyFigureCollection item and it lands here.",
      link: {
        label: "Install from Firefox Add-ons",
        href: "https://addons.example",
      },
    });
  });

  test("without it, while a store reviews it, what still works", () => {
    expect(emptyMessage("absent", IN_REVIEW)).toEqual({
      body: "The myakiba extension is in review at the Chrome Web Store. Picking items works once it's approved.",
      link: null,
    });
  });

  test("without it, while its store reviews it and another lists it, where to pick meanwhile", () => {
    expect(
      emptyMessage("absent", {
        kind: "in_review",
        store: "firefoxAddons",
        alternative: { store: "chromeWebStore", url: "https://chrome.example" },
      }),
    ).toEqual({
      body: "The myakiba extension is in review at Firefox Add-ons. Pick items in Chrome, Edge or another Chromium browser until then.",
      link: { label: "View on the Chrome Web Store", href: "https://chrome.example" },
    });
  });

  test("without it, in a browser it does not run in, which ones it does", () => {
    expect(emptyMessage("absent", UNSUPPORTED)).toEqual({
      body: "Picking items needs the myakiba extension, which runs on a computer in Chrome, Edge or another Chromium browser, or in Firefox 140 or later.",
      link: null,
    });
  });
});
