import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster, createToastManager } from "./toast";

afterEach(cleanup);

test("F6 twice still lets Shift+Tab return to where the keyboard was", async () => {
  const manager = createToastManager();
  render(
    <Toaster toastManager={manager}>
      <input aria-label="Origin" />
    </Toaster>,
  );
  const origin = screen.getByRole("textbox", { name: "Origin" });
  const user = userEvent.setup();
  await user.click(origin);
  act(() => {
    manager.add({ title: "Saved", timeout: 0 });
  });
  await screen.findByText("Saved");

  await user.keyboard("{F6}{F6}");
  await user.tab({ shift: true });

  expect(document.activeElement).toBe(origin);
});
