import type { FormEvent } from "react";

type Submittable = { readonly handleSubmit: () => Promise<void> };

/**
 * A form's `onSubmit`: it keeps the browser from navigating, keeps an outer form from submitting
 * too, and awaits the form's submit. A write handler resolves a Result and never rejects, so a
 * rejection is a defect, and it is reported here.
 */
export function formSubmitHandler(form: Submittable) {
  return async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await form.handleSubmit();
    } catch (submitError) {
      console.error(submitError);
    }
  };
}
