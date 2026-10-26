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
import { StatusButton, useButtonStatus } from "@/components/ui/status-button";
import { Textarea } from "@/components/ui/textarea";

export function ListFormDialog({
  renderTrigger,
  open,
  onOpenChange,
  title,
  description,
  ...formProps
}: {
  readonly renderTrigger?: ReactElement;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
} & ListFormProps): React.JSX.Element {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actualOpen = open ?? internalOpen;

  const setOpen = (nextOpen: boolean): void => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog
      open={actualOpen}
      onOpenChange={(nextOpen) => {
        if (isSubmitting && !nextOpen) return;
        setOpen(nextOpen);
      }}
    >
      {renderTrigger ? <DialogTrigger render={renderTrigger} /> : null}
      {actualOpen ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ListForm
            {...formProps}
            onSubmit={async (input) => {
              setIsSubmitting(true);
              try {
                await formProps.onSubmit(input);
                setOpen(false);
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

type ListFormProps = {
  readonly initialTitle?: string;
  readonly initialDescription?: string;
  readonly submitLabel: string;
  readonly onSubmit: (input: ListInput) => Promise<void>;
};

// Mounted per open, so each open starts from the List's current title and description.
function ListForm({
  initialTitle = "",
  initialDescription = "",
  submitLabel,
  onSubmit,
}: ListFormProps): React.JSX.Element {
  const titleInputId = useId();
  const descriptionInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, run } = useButtonStatus();
  const form = useForm({
    defaultValues: { title: initialTitle, description: initialDescription },
    validators: { onSubmit: listInputSchema },
    onSubmitInvalid: () => inputRef.current?.focus(),
    onSubmit: ({ value }) =>
      run(() => onSubmit({ title: value.title.trim(), description: value.description.trim() })),
  });

  return (
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
            <StatusButton type="submit" status={status} disabled={!canSubmit || isSubmitting}>
              {submitLabel}
            </StatusButton>
          </DialogFooter>
        )}
      </form.Subscribe>
    </form>
  );
}
