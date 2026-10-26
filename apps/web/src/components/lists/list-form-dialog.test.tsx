import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "motion/react";
import { ListFormDialog } from "./list-form-dialog";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

// Browsers move focus off a button that becomes disabled. happy-dom keeps it, so the test watches
// the attribute itself.
test("the submit button is never disabled through a submit that fails, so it keeps focus", async () => {
  const submits: PromiseWithResolvers<undefined>[] = [];
  render(
    <ListFormDialog
      renderTrigger={<button type="button">Open</button>}
      title="New List"
      description="Group items."
      submitLabel="Create"
      onSubmit={() => {
        const submit = Promise.withResolvers<undefined>();
        submits.push(submit);
        return submit.promise;
      }}
    />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Open" }));
  await user.type(await screen.findByRole("textbox", { name: "Title" }), "Figures");
  const create = screen.getByRole<HTMLButtonElement>("button", { name: "Create" });
  const disabledStates: boolean[] = [];
  const observer = new MutationObserver(() => disabledStates.push(create.disabled));
  observer.observe(create, { attributeFilter: ["disabled"] });

  await user.click(create);
  await waitFor(() => expect(submits).toHaveLength(1));
  expect(create.getAttribute("aria-busy")).toBe("true");

  await act(async () => submits[0]?.reject(new Error("offline")));
  await waitFor(() => expect(create.dataset.status).toBe("idle"));
  await act(async () => {});
  observer.disconnect();

  expect(disabledStates).toEqual([]);
  expect(create.disabled).toBe(false);
  expect(document.activeElement).toBe(create);
});
