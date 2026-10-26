import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "motion/react";
import { ConfirmDialog } from "./confirm-dialog";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

test("reopened right after a confirm, the confirm button is idle and confirms again", async () => {
  let confirms = 0;
  render(
    <ConfirmDialog
      renderTrigger={<button type="button">Delete list</button>}
      title="Delete list?"
      onConfirm={async () => {
        confirms += 1;
      }}
    />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Delete list" }));
  await user.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await user.click(screen.getByRole("button", { name: "Delete list" }));
  const confirm = await screen.findByRole("button", { name: "Delete" });
  expect(confirm.dataset.status).toBe("idle");
  expect(confirm.getAttribute("aria-disabled")).toBeNull();

  await user.click(confirm);
  await waitFor(() => expect(confirms).toBe(2));
});
