import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

await mock.module("@/lib/extension-release", () => ({ EXTENSION_RELEASE: "in_review" }));
const {
  ENTRY_POINTS,
  FORMS,
  SYNC_STEP_TITLE,
  currentExtension,
  importActions,
  loadExtension,
  onboardingAtSyncStep,
  openOnboardingStep,
  openSyncStep,
  renderEntryPoint,
  renderWithDialog,
  resetEntryPoints,
  sent,
  settingsImport,
} = await import("../../../test/extension-entry-points");
const { default: FAQsSection } = await import("@/components/homepage/faqs");

afterEach(resetEntryPoints);

const UNDER_REVIEW = "The myakiba browser extension is under review";

function expectReviewNotice(text: string | null) {
  expect(text).toContain(UNDER_REVIEW);
  expect(text).toContain("Chrome Web Store and Firefox Add-ons");
  expect(text).toContain("released shortly");
  expect(text).toContain("the new way to import items from MyFigureCollection");
  expect(text).toContain("importing is unavailable");
}

describe.each(ENTRY_POINTS.map((entryPoint) => [entryPoint.name, entryPoint] as const))(
  "%s",
  (_name, entryPoint) => {
    test("shows the review notice and starts nothing, even with the extension ready", async () => {
      loadExtension({ installed: true });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      const notice = await screen.findByRole("dialog", { name: UNDER_REVIEW });
      expectReviewNotice(notice.textContent);
      expect(screen.queryByRole("link", { name: /How to install it/u })).toBeNull();
      expect(proceeded()).toBe(false);
      expect(sent).toEqual([]);
      expect(currentExtension().runs).toEqual([]);
    });
  },
);

describe.each(
  FORMS.filter((form) => form.opensThroughGate === undefined).map(
    (form) => [form.name, form] as const,
  ),
)("%s", (_name, form) => {
  test("a submit sends nothing and shows the review notice, even with the extension ready", async () => {
    loadExtension({ installed: true });
    const user = userEvent.setup();
    renderWithDialog(form.render());
    await form.open(user);
    await form.fill(user);

    // The typed forms submit from the keyboard, and the CSV form from its button.
    if (form.sends === "csv") await user.click(screen.getByRole("button", { name: form.submit }));
    else await user.keyboard("{Enter}");

    await screen.findByRole("dialog", { name: UNDER_REVIEW });
    expect(sent).toEqual([]);
    expect(currentExtension().runs).toEqual([]);
  });
});

test("onboarding's extension step shows the review notice instead of install steps", async () => {
  loadExtension({ installed: false });
  const user = userEvent.setup();
  renderWithDialog(onboardingAtSyncStep());

  await openOnboardingStep(user, 2);

  const title = await screen.findByText(UNDER_REVIEW);
  expectReviewNotice(title.closest("[role=dialog]")?.textContent ?? null);
  expect(screen.queryByText("Not installed")).toBeNull();
  expect(screen.queryByRole("link", { name: /How to install it/u })).toBeNull();
});

test("onboarding's sync step says importing is unavailable", async () => {
  loadExtension({ installed: true });
  const user = userEvent.setup();
  renderWithDialog(onboardingAtSyncStep());

  await openSyncStep(user);

  expectReviewNotice(screen.getByRole("dialog", { name: SYNC_STEP_TITLE }).textContent);
});

test("the settings import says importing is unavailable", async () => {
  const IdleImport = settingsImport({ kind: "ready", current: { kind: "none" } }, { kind: "idle" });
  renderWithDialog(<IdleImport actions={importActions(() => {})} />);

  const title = await screen.findByText(UNDER_REVIEW);
  expectReviewNotice(title.parentElement?.textContent ?? null);
});

test("the FAQ answers how to get the extension with the review notice", async () => {
  const user = userEvent.setup();
  render(<FAQsSection />);

  await user.click(
    screen.getByRole("button", { name: "How do I install the myakiba browser extension?" }),
  );

  const answer = await screen.findByText(new RegExp(UNDER_REVIEW, "u"));
  expectReviewNotice(answer.textContent);
});
