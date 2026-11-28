import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  LISTING_URLS,
  SAFARI,
  SUPPORTED_BROWSERS,
  browseWith,
  listIn,
} from "../../../test/extension-browser";

const { InstallAction } = await import("./kit");

afterEach(cleanup);

function action(name: RegExp) {
  const link = screen.queryByRole("button", { name });
  return { href: link?.getAttribute("href"), target: link?.getAttribute("target") };
}

const installLink = () => action(/^Install the extension/u);

test.each(SUPPORTED_BROWSERS)("$name opens $storeName", (browser) => {
  listIn("chromeWebStore", "firefoxAddons");
  browseWith(browser.userAgent);
  render(<InstallAction />);
  expect(installLink()).toEqual({ href: LISTING_URLS[browser.store], target: "_blank" });
});

test("while Chrome's store reviews it, Chrome opens the Firefox listing", () => {
  const [chrome] = SUPPORTED_BROWSERS;
  listIn("firefoxAddons");
  browseWith(chrome.userAgent);
  render(<InstallAction />);
  expect(installLink()).toEqual({ href: LISTING_URLS.firefoxAddons, target: "_blank" });
});

test.each([
  ["a browser with no listing", SAFARI],
  [
    "a phone",
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  ],
])("in %s it goes to How it works", (_, userAgent) => {
  listIn("chromeWebStore", "firefoxAddons");
  browseWith(userAgent);
  render(<InstallAction />);
  expect(action(/^How it works$/u)).toEqual({ href: "#how-it-works", target: null });
});
