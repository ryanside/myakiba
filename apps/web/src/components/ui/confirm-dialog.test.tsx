import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Panic, Result } from "better-result";
import { MotionGlobalConfig } from "motion/react";
import { WriteConfirmDialog } from "@/components/write-confirm-dialog";
import { WriteFailed } from "@/lib/errors/write-failed";
import { ConfirmDialog } from "./confirm-dialog";

const consoleError = spyOn(console, "error").mockImplementation(() => {});

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
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

test("reopened right after a confirm, the confirm button is idle and confirms again", async () => {
  let confirms = 0;
  render(
    <ConfirmDialog
      renderTrigger={<button type="button">Delete list</button>}
      title="Delete list?"
      onConfirm={async () => {
        confirms += 1;
        return Result.ok();
      }}
    />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Delete list" }));
  await user.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await user.click(screen.getByRole("button", { name: "Delete list" }));
  const confirmButton = await screen.findByRole("button", { name: "Delete" });
  expect(confirmButton.dataset.status).toBe("idle");
  expect(confirmButton.getAttribute("aria-disabled")).toBeNull();

  await user.click(confirmButton);
  await waitFor(() => expect(confirms).toBe(2));
});
