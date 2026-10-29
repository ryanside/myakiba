import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { configure, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LISTING_URLS,
  SAFARI,
  SUPPORTED_BROWSERS,
  listIn,
  browseWith,
} from "../../../test/extension-browser";
import type { SupportedBrowser } from "../../../test/extension-browser";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const {
  SYNC_STEP_TITLE,
  importActions,
  loadExtension,
  onboardingAtSyncStep,
  openOnboardingStep,
  openSyncStep,
  renderWithDialog,
  resetEntryPoints,
  settingsImport,
} = await import("../../../test/extension-entry-points");
const { default: FAQsSection } = await import("@/components/homepage/faqs");

afterEach(resetEntryPoints);

const UNDER_REVIEW = "The myakiba browser extension is under review";
const UNSUPPORTED = "Importing needs desktop Chrome or Firefox";
const EXTENSION_STEP_TITLE = "Install the myakiba extension.";

function expectReviewNotice(text: string | null | undefined, storeName: string) {
  expect(text).toContain(UNDER_REVIEW);
  expect(text).toContain(`It is in review at ${storeName} now`);
  expect(text).toContain("it will be released shortly");
  expect(text).toContain("the new way to import items from MyFigureCollection");
  expect(text).toContain("importing is unavailable until it passes review");
}

const installLink = (browser: SupportedBrowser) =>
  screen.queryByRole("link", { name: `Install from ${browser.storeName} (opens in a new tab)` });

const IdleImport = settingsImport({ kind: "ready", current: { kind: "none" } }, { kind: "idle" });

const SURFACES = [
  {
    name: "onboarding's extension step",
    open: async () => {
      const user = userEvent.setup();
      renderWithDialog(onboardingAtSyncStep());
      await openOnboardingStep(user, 2);
      return screen.findByRole("dialog", { name: EXTENSION_STEP_TITLE });
    },
  },
  {
    name: "onboarding's sync step",
    open: async () => {
      const user = userEvent.setup();
      renderWithDialog(onboardingAtSyncStep());
      await openSyncStep(user);
      return screen.getByRole("dialog", { name: SYNC_STEP_TITLE });
    },
  },
  {
    name: "the settings import",
    open: async () => {
      renderWithDialog(<IdleImport actions={importActions(() => {})} />);
      return document.body;
    },
  },
] as const;

describe.each(SURFACES.map((surface) => [surface.name, surface] as const))(
  "%s",
  (_name, surface) => {
    describe.each(SUPPORTED_BROWSERS.map((browser) => [browser.name, browser] as const))(
      "in %s",
      (_browser, browser) => {
        test("links to this browser's store listing while the extension is missing", async () => {
          browseWith(browser.userAgent);
          listIn(browser.store);
          loadExtension({ installed: false });

          await surface.open();

          await waitFor(() =>
            expect(installLink(browser)?.getAttribute("href")).toBe(LISTING_URLS[browser.store]),
          );
          expect(screen.queryByText(UNDER_REVIEW)).toBeNull();
        });

        test("shows the review notice while the extension is missing and this store has no listing", async () => {
          browseWith(browser.userAgent);
          listIn();
          loadExtension({ installed: false });

          const container = await surface.open();

          await screen.findByText(UNDER_REVIEW);
          expectReviewNotice(container.textContent, browser.storeName);
          expect(installLink(browser)).toBeNull();
        });

        test("shows no notice once the extension is installed, even with no listing", async () => {
          browseWith(browser.userAgent);
          listIn();
          loadExtension({ installed: true });

          await surface.open();
          await new Promise((resolve) => {
            setTimeout(resolve, 100);
          });

          expect(screen.queryByText(UNDER_REVIEW)).toBeNull();
          expect(installLink(browser)).toBeNull();
        });
      },
    );

    test("says the extension needs desktop Chrome or Firefox in another browser", async () => {
      browseWith(SAFARI);
      listIn("chromeWebStore", "firefoxAddons");
      loadExtension({ installed: false });

      await surface.open();

      expect(await screen.findByText(UNSUPPORTED)).toBeDefined();
      expect(screen.queryByRole("link", { name: /^Install from/u })).toBeNull();
    });
  },
);

test("onboarding's extension step reads as connected once the extension is installed", async () => {
  browseWith(SUPPORTED_BROWSERS[0].userAgent);
  listIn();
  loadExtension({ installed: true });

  await SURFACES[0].open();

  expect(await screen.findByText("Extension connected")).toBeDefined();
});

async function faqAnswer() {
  const user = userEvent.setup();
  render(<FAQsSection />);
  await user.click(
    screen.getByRole("button", { name: "How do I install the myakiba browser extension?" }),
  );
  const answer = await screen.findByText(/You need the extension|under review/u);
  return answer;
}

test("the FAQ says the extension is under review while no store lists it", async () => {
  listIn();

  const answer = await faqAnswer();

  expectReviewNotice(answer.textContent, "the Chrome Web Store and Firefox Add-ons");
  expect(screen.queryByRole("link", { name: /Chrome Web Store|Firefox Add-ons/u })).toBeNull();
});

test("the FAQ links each listed store and says which are still reviewing", async () => {
  listIn("chromeWebStore");

  const answer = await faqAnswer();

  expect(screen.getByRole("link", { name: "the Chrome Web Store" }).getAttribute("href")).toBe(
    LISTING_URLS.chromeWebStore,
  );
  expect(answer.textContent).toContain(
    "For Firefox, it is in review at Firefox Add-ons now, and it will be released shortly.",
  );
  expect(answer.textContent).not.toContain("importing is unavailable");
});

test("the FAQ links both stores once both list the extension", async () => {
  listIn("chromeWebStore", "firefoxAddons");

  const answer = await faqAnswer();

  expect(screen.getByRole("link", { name: "the Chrome Web Store" }).getAttribute("href")).toBe(
    LISTING_URLS.chromeWebStore,
  );
  expect(screen.getByRole("link", { name: "Firefox Add-ons" }).getAttribute("href")).toBe(
    LISTING_URLS.firefoxAddons,
  );
  expect(answer.textContent).not.toContain("in review");
});

test("the update link opens an FAQ answer that says how to update, even while every store reviews", async () => {
  listIn();
  const { UPDATE_LINK } = await import("@/components/extension/extension-notice");
  window.location.hash = new URL(UPDATE_LINK.href, "https://myakiba.test").hash;

  render(<FAQsSection />);

  const answer = await screen.findByText(/updates the extension/u);
  expect(answer.textContent).toContain("Check for Updates");
  expect(answer.textContent).toContain("reload myakiba");
  expect(answer.textContent).not.toContain("in review");
  window.location.hash = "";
});

test("the update answer tells Chrome users how to update now without removing the extension", async () => {
  const user = userEvent.setup();
  render(<FAQsSection />);
  await user.click(
    screen.getByRole("button", { name: "How do I update the myakiba browser extension?" }),
  );

  const answer = await screen.findByText(/updates the extension/u);
  expect(answer.textContent).toContain(
    "In Chrome, open chrome://extensions, turn on Developer mode and click Update.",
  );
  expect(answer.textContent).not.toContain("remove the extension");
});
