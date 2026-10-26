import { afterEach, expect, spyOn, test } from "bun:test";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { Panic, Result } from "better-result";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { WriteFailed } from "@/lib/errors/write-failed";
import { ConfirmDialog } from "./confirm-dialog";

const consoleError = spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  cleanup();
  consoleError.mockClear();
});

/** Confirms, and waits until the confirm has settled. */
async function confirm() {
  act(() => screen.getByRole("button", { name: "Delete" }).click());
  const dialog = await screen.findByRole("dialog");
  await act(async () => within(dialog).getByRole("button", { name: "Delete" }).click());
}

test("a write that fails keeps the dialog open and reports nothing new", async () => {
  render(
    <WriteConfirmDialog
      title="Delete order?"
      renderTrigger={<button type="button">Delete</button>}
      onConfirm={async () =>
        Result.err(new WriteFailed({ cause: new Error("refused"), message: "refused" }))
      }
    />,
  );
  await confirm();

  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(consoleError).not.toHaveBeenCalled();
});

test("a write that saves closes the dialog", async () => {
  render(
    <WriteConfirmDialog
      title="Delete order?"
      renderTrigger={<button type="button">Delete</button>}
      onConfirm={async () => Result.ok()}
    />,
  );
  await confirm();

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(consoleError).not.toHaveBeenCalled();
});

test("a confirm that rejects is reported as a defect and keeps the dialog open", async () => {
  const rejection = new TypeError("onDelete is not a function");
  render(
    <ConfirmDialog
      title="Delete order?"
      renderTrigger={<button type="button">Delete</button>}
      onConfirm={() => Promise.reject(rejection)}
    />,
  );
  await confirm();

  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(consoleError).toHaveBeenCalledTimes(1);
  const [reported] = consoleError.mock.calls[0] ?? [];
  expect(Panic.is(reported) && reported.cause).toBe(rejection);
});
