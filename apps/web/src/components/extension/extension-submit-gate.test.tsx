import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { configure, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SUPPORTED_BROWSERS, listIn, browseWith } from "../../../test/extension-browser";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const { FORMS, currentExtension, loadExtension, renderWithDialog, resetEntryPoints, sent } =
  await import("../../../test/extension-entry-points");

const [CHROME] = SUPPORTED_BROWSERS;
browseWith(CHROME.userAgent);
listIn(CHROME.store);

afterEach(resetEntryPoints);

describe.each(FORMS.map((form) => [form.name, form] as const))("%s", (_name, form) => {
  test("sends nothing when the extension went away while it was open, and keeps its values", async () => {
    loadExtension({ installed: true });
    const user = userEvent.setup();
    renderWithDialog(form.render());
    await form.open(user);
    await form.fill(user);

    currentExtension().setInstalled(false);
    await user.click(screen.getByRole("button", { name: form.submit }));

    await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
    expect(sent).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /myakiba extension/u })).toBeNull(),
    );
    form.kept();
  });

  test("sends when the extension is still there", async () => {
    loadExtension({ installed: true });
    const user = userEvent.setup();
    renderWithDialog(form.render());
    await form.open(user);
    await form.fill(user);

    await user.click(screen.getByRole("button", { name: form.submit }));

    await waitFor(() => expect(sent).toEqual([form.sends]));
  });
});
