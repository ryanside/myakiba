import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Panic } from "better-result";
import { formSubmitHandler } from "./form-submit";

const consoleError = spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  cleanup();
  consoleError.mockClear();
});

/** Submits a form nested in an outer submit listener, the way a dialog's form sits in a page's. */
function submit(handleSubmit: () => Promise<void>) {
  const outer = mock();
  render(
    <div onSubmit={outer}>
      <form aria-label="draft" onSubmit={formSubmitHandler({ handleSubmit })} />
    </div>,
  );
  const navigates = fireEvent.submit(screen.getByRole("form", { name: "draft" }));
  return { navigates, outer };
}

test("keeps the browser from navigating and an outer form from submitting, and runs the submit", async () => {
  const handleSubmit = mock(async () => {});
  const { navigates, outer } = submit(handleSubmit);

  expect(navigates).toBe(false);
  expect(outer).not.toHaveBeenCalled();
  expect(handleSubmit).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(handleSubmit).toHaveReturned());
  expect(consoleError).not.toHaveBeenCalled();
});

test("reports a Panic that rejects the submit, and the log shows that Panic", async () => {
  const defect = new Panic({ message: "submit broke" });
  submit(() => Promise.reject(defect));

  await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
  expect(consoleError.mock.calls[0]).toContain(defect);
});

test("reports any other rejection as a defect, a Panic with the rejection as its cause", async () => {
  const rejection = new TypeError("onSubmit is not a function");
  submit(() => Promise.reject(rejection));

  await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
  const [reported] = consoleError.mock.calls[0] ?? [];
  expect(Panic.is(reported) && reported.cause).toBe(rejection);
});
