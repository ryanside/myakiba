import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

// These forms send as they do once the extension is released. A revision from before the
// release state ignores this mock.
await mock.module("@/lib/extension-release", () => ({ EXTENSION_RELEASE: "released" }));
const { FORMS, currentExtension, loadExtension, noop, renderWithDialog, resetEntryPoints, sent } =
  await import("../../../test/extension-entry-points");
const { DataTransferView } = await import("@/components/settings/data-transfer");

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

test("the import confirmation sends nothing when the extension went away while it was open", async () => {
  loadExtension({ installed: true });
  const user = userEvent.setup();
  let confirmed = 0;
  renderWithDialog(
    <DataTransferView
      actions={{
        handleExport: noop,
        handleReconnectImportStatus: noop,
        handleRetryCurrentImportLoad: noop,
        onFile: noop,
        handleFileError: noop,
        handleConfirmImport: async () => {
          confirmed += 1;
        },
        handleRetryCurrentImport: noop,
        handleDeleteCurrentImport: async () => {},
      }}
      state={{
        export: { kind: "idle" },
        import: {
          current: { kind: "ready", current: { kind: "none" } },
          delete: { kind: "idle" },
          prepared: {
            kind: "ready",
            file: new File(["{}"], "myakiba-export.json"),
            preview: { orders: 1, collectionItems: 2 },
          },
          start: { kind: "idle" },
        },
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Import data" }));
  const confirmation = await screen.findByRole("dialog", { name: "Import this export?" });

  currentExtension().setInstalled(false);
  await user.click(within(confirmation).getByRole("button", { name: "Import data" }));

  await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
  expect(confirmed).toBe(0);
  expect(screen.getByText("myakiba-export.json")).toBeDefined();
});
