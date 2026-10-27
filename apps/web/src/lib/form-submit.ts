import type { FormEvent } from "react";
import { reportDefect } from "./as-panic";

type Submittable = { readonly handleSubmit: () => Promise<void> };

/**
 * Awaits a submit and never rejects. A write handler resolves a Result and never rejects, so a
 * rejection is a defect, reported here as a Panic the way `useResourceMutation` reports one. A submit that no
 * form event starts, such as a key handler's, runs through this.
 */
export async function runSubmit(submit: Submittable["handleSubmit"]): Promise<void> {
  try {
    await submit();
  } catch (submitError) {
    reportDefect(submitError);
  }
}

/**
 * A form's `onSubmit`: it keeps the browser from navigating, keeps an outer form from submitting
 * too, and runs the form's submit with `runSubmit`.
 */
export function formSubmitHandler(form: Submittable) {
  return async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    await runSubmit(() => form.handleSubmit());
  };
}
