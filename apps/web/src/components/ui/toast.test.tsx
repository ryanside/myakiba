import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Toaster, toast, useToastManager } from "./toast";

afterEach(cleanup);

function Timeouts(): React.JSX.Element {
  const { toasts } = useToastManager();
  return (
    <output>{toasts.map((item) => `${item.title}:${item.timeout ?? "default"}`).join("|")}</output>
  );
}

// A failed save rolls back its edit, so its error must stay readable until the user dismisses it.
test("an error toast stays until dismissed, while other toasts still time out", () => {
  render(
    <Toaster>
      <Timeouts />
    </Toaster>,
  );

  act(() => {
    toast.add({ type: "error", title: "Couldn't save" });
    toast.add({ type: "success", title: "Saved" });
    toast.add({ type: "error", title: "Brief error", timeout: 3000 });
  });

  expect(screen.getByRole("status").textContent?.split("|").toSorted()).toEqual([
    "Brief error:3000",
    "Couldn't save:0",
    "Saved:default",
  ]);
});
