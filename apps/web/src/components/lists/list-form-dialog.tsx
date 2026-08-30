import { listInputSchema } from "@myakiba/contracts/lists/schema";
import type { ListInput } from "@myakiba/contracts/lists/schema";
import { useForm } from "@tanstack/react-form";
import { useId, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function ListFormDialog({
  renderTrigger,
  triggerNativeButton = true,
  triggerRole,
  title,
  description,
  initialTitle = "",
  initialDescription = "",
  submitLabel,
  pendingLabel,
  onSubmit,
}: {
  readonly renderTrigger: ReactElement;
  readonly triggerNativeButton?: boolean;
  readonly triggerRole?: "menuitem";
  readonly title: string;
  readonly description: string;
  readonly initialTitle?: string;
  readonly initialDescription?: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly onSubmit: (input: ListInput) => Promise<void>;
}): React.JSX.Element {
  const titleInputId = useId();
  const descriptionInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: { title: initialTitle, description: initialDescription },
    validators: { onSubmit: listInputSchema },
    onSubmitInvalid: () => inputRef.current?.focus(),
    onSubmit: async ({ value }) => {
      await onSubmit({ title: value.title.trim(), description: value.description.trim() });
      setOpen(false);
    },
  });

  const handleOpenChange = (nextOpen: boolean): void => {
    if (form.state.isSubmitting && !nextOpen) return;
    if (nextOpen) {
      form.reset({ title: initialTitle, description: initialDescription });
    }
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={renderTrigger} nativeButton={triggerNativeButton} role={triggerRole} />
      {open ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              event.stopPropagation();
              try {
                await form.handleSubmit();
              } catch {
                // The mutation reports the error and the dialog stays open.
              }
            }}
          >
            <FieldGroup>
              <form.Field name="title">
                {(field) => {
                  const isInvalid = !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid ? true : undefined}>
                      <FieldLabel htmlFor={titleInputId}>Title</FieldLabel>
                      <Input
                        ref={inputRef}
                        id={titleInputId}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={isInvalid ? true : undefined}
                        aria-describedby={isInvalid ? `${titleInputId}-error` : undefined}
                        autoFocus
                      />
                      <FieldError id={`${titleInputId}-error`} errors={field.state.meta.errors} />
                    </Field>
                  );
                }}
              </form.Field>
              <form.Field name="description">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={descriptionInputId}>Description (optional)</FieldLabel>
                    <Textarea
                      id={descriptionInputId}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="Optional"
                      rows={3}
                    />
                  </Field>
                )}
              </form.Field>
            </FieldGroup>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <DialogFooter className="mt-4">
                  <DialogClose
                    render={<Button type="button" variant="outline" />}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </DialogClose>
                  <Button type="submit" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                    {isSubmitting ? pendingLabel : submitLabel}
                  </Button>
                </DialogFooter>
              )}
            </form.Subscribe>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
