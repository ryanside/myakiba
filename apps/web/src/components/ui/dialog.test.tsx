import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./dialog";

afterEach(cleanup);

test("a dialog without animations closes and unmounts without an end event", async () => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  Object.defineProperty(media, "matches", { value: true });
  const matchMedia = spyOn(window, "matchMedia").mockReturnValue(media);
  const getAnimations = spyOn(Element.prototype, "getAnimations").mockReturnValue([]);
  try {
    render(
      <Dialog>
        <DialogTrigger>New List</DialogTrigger>
        <DialogContent>
          <DialogTitle>New List</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New List" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(document.querySelector('[data-slot="dialog-content"]') === null).toBe(true);
      expect(document.querySelector('[data-slot="dialog-overlay"]') === null).toBe(true);
    });
    expect(getAnimations).toHaveBeenCalled();
  } finally {
    matchMedia.mockRestore();
    getAnimations.mockRestore();
  }
});
