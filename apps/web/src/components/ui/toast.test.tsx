import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster, createToastManager, toast, useToastManager } from "./toast";

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

function Timeouts(): React.JSX.Element {
  const { toasts } = useToastManager();
  return (
    <output>{toasts.map((item) => `${item.title}:${item.timeout ?? "default"}`).join("|")}</output>
  );
}

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

test("repeated errors leave one toast and dismiss without revealing an older copy", async () => {
  render(<Toaster />);

  act(() => {
    for (let attempt = 0; attempt < 4; attempt++) {
      toast.add({ type: "error", title: "Invalid email or password" });
    }
  });

  expect(screen.getAllByText("Invalid email or password")).toHaveLength(1);
  fireEvent.click(screen.getByLabelText("Close toast"));
  await waitFor(() => expect(screen.queryByText("Invalid email or password")).toBeNull());

  act(() => {
    toast.add({ type: "error", title: "Invalid email or password" });
  });
  expect(screen.getAllByText("Invalid email or password")).toHaveLength(1);
});

test("a toast of any type with an id replaces the one before it", () => {
  render(<Toaster />);

  act(() => {
    for (let pick = 0; pick < 3; pick++) {
      toast.add({ id: "picture-quota", type: "warning", title: "Saved without pictures" });
    }
  });

  expect(screen.getAllByText("Saved without pictures")).toHaveLength(1);
});

test("error identity includes its description and preserves caller-provided ids", () => {
  render(<Toaster limit={10} />);

  act(() => {
    toast.add({ type: "error", title: "Couldn't save", description: "Order A" });
    toast.add({ type: "error", title: "Couldn't save", description: "Order B" });
    toast.add({ type: "error", title: "Couldn't save", id: "first-save" });
    toast.add({ type: "error", title: "Couldn't save", id: "second-save" });
  });

  expect(screen.getAllByText("Couldn't save")).toHaveLength(4);
  expect(screen.getByText("Order A")).toBeTruthy();
  expect(screen.getByText("Order B")).toBeTruthy();
});

test("a repeated error returns to the visible front after newer errors", () => {
  render(<Toaster limit={3} />);

  act(() => {
    for (const title of ["Error A", "Error B", "Error C", "Error D"]) {
      toast.add({ type: "error", title });
    }
  });
  expect(
    screen.getByText("Error A").closest<HTMLElement>('[data-slot="toast"]')?.dataset.limited !==
      undefined,
  ).toBe(true);

  act(() => {
    toast.add({ type: "error", title: "Error A" });
  });

  const repeated = screen.getByText("Error A").closest<HTMLElement>('[data-slot="toast"]');
  expect(repeated?.dataset.limited).toBeUndefined();
  expect(repeated?.style.getPropertyValue("--toast-index")).toBe("0");
  expect(screen.getAllByText("Error A")).toHaveLength(1);
});
