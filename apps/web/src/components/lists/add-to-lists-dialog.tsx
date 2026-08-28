import { useId, useRef, useState } from "react";
import type { ReactElement } from "react";
import { ExternalLinkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { listInputSchema } from "@myakiba/contracts/lists/schema";
import type { ListTarget } from "@myakiba/contracts/lists/schema";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useAddTargetsToListsMutation,
  useListOptionsForTargetsQuery,
  useListMutations,
  useRemoveTargetsFromListMutation,
} from "@/hooks/use-lists";
import { cn } from "@/lib/utils";
import type { getListOptionsForTargets } from "@/queries/lists";

type ListOptionsForTargets = NonNullable<Awaited<ReturnType<typeof getListOptionsForTargets>>>;

function CreateListForm({
  onCreated,
  disabled,
}: {
  readonly onCreated: (listId: string) => void;
  readonly disabled: boolean;
}): React.JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitError, setSubmitError] = useState(false);
  const { createList } = useListMutations({ showCreateErrorToast: false });
  const form = useForm({
    defaultValues: { title: "", description: "" },
    validators: { onSubmit: listInputSchema },
    onSubmitInvalid: () => inputRef.current?.focus(),
    onSubmit: async ({ value }) => {
      const created = await createList({ title: value.title.trim(), description: "" });
      form.reset();
      setSubmitError(false);
      onCreated(created.id);
    },
  });

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        setSubmitError(false);
        try {
          await form.handleSubmit();
        } catch {
          setSubmitError(true);
        }
      }}
    >
      <form.Field name="title">
        {(field) => {
          const isInvalid = !field.state.meta.isValid || submitError;
          return (
            <Field data-invalid={isInvalid ? true : undefined}>
              <FieldLabel htmlFor={inputId}>New List</FieldLabel>
              <InputGroup>
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <>
                      <InputGroupInput
                        ref={inputRef}
                        id={inputId}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          setSubmitError(false);
                          field.handleChange(event.target.value);
                        }}
                        placeholder="List title"
                        aria-invalid={isInvalid ? true : undefined}
                        aria-describedby={isInvalid ? `${inputId}-error` : undefined}
                        disabled={isSubmitting || disabled}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton type="submit" disabled={isSubmitting || disabled}>
                          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                          {isSubmitting ? "Creating..." : "Create"}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </>
                  )}
                </form.Subscribe>
              </InputGroup>
              <FieldError
                id={`${inputId}-error`}
                errors={submitError ? undefined : field.state.meta.errors}
              >
                {submitError ? "Couldn't create List. Try again." : null}
              </FieldError>
            </Field>
          );
        }}
      </form.Field>
    </form>
  );
}

function ListOptionRow({
  list,
  targets,
  targetCount,
  targetNoun,
  selected,
  isSubmitting,
  onSelectedChange,
  onRemoveStarted,
}: {
  readonly list: ListOptionsForTargets["lists"][number];
  readonly targets: readonly ListTarget[];
  readonly targetCount: number;
  readonly targetNoun: "Item" | "Collection Item" | "Order" | null;
  readonly selected: boolean;
  readonly isSubmitting: boolean;
  readonly onSelectedChange: (checked: boolean) => void;
  readonly onRemoveStarted: () => void;
}): React.JSX.Element {
  const removeMutation = useRemoveTargetsFromListMutation(targets);
  const alreadyAdded = list.memberCount === targetCount;
  const descriptionId = `add-to-list-${list.id}-description`;
  const errorId = `add-to-list-${list.id}-error`;
  const isRemoving = removeMutation.isPending;
  const isDisabled = isSubmitting || isRemoving;
  const removalLabel = targetNoun
    ? `${list.memberCount} selected ${list.memberCount === 1 ? targetNoun : `${targetNoun}s`}`
    : `${list.memberCount} selected`;

  return (
    <Field
      orientation="horizontal"
      data-disabled={isDisabled ? true : undefined}
      aria-busy={isRemoving}
    >
      <Checkbox
        id={`add-to-list-${list.id}`}
        checked={selected}
        disabled={alreadyAdded || isDisabled}
        aria-describedby={list.memberCount > 0 ? descriptionId : undefined}
        onCheckedChange={(checked) => onSelectedChange(checked === true)}
      />
      <FieldContent>
        <div className="flex w-fit items-center gap-1">
          <FieldLabel htmlFor={`add-to-list-${list.id}`} className="font-normal">
            {list.title}
          </FieldLabel>
          <Link
            to="/lists/$listId"
            params={{ listId: list.id }}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${list.title} in a new tab`}
            title={`Open ${list.title} in a new tab`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-xs" }),
              "size-4.5 rounded-sm",
            )}
          >
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-3" aria-hidden="true" />
          </Link>
        </div>
        {list.memberCount > 0 ? (
          <FieldDescription
            id={descriptionId}
            className="flex items-center gap-1 text-sm leading-snug"
          >
            <span>
              {alreadyAdded
                ? "Already added."
                : `${list.memberCount} of ${targetCount} already added.`}
            </span>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto cursor-pointer border-0 p-0 text-sm leading-snug font-normal text-destructive underline-offset-auto transition-none"
              disabled={isDisabled}
              aria-label={`Remove ${removalLabel} from ${list.title}`}
              aria-describedby={removeMutation.error ? errorId : undefined}
              onClick={async () => {
                onRemoveStarted();
                try {
                  await removeMutation.mutateAsync(list.id);
                } catch {
                  // The inline row error remains available for retry.
                }
              }}
            >
              {isRemoving ? "Removing..." : "Remove"}
            </Button>
          </FieldDescription>
        ) : null}
        <FieldError id={errorId}>
          {removeMutation.error ? "Couldn't remove. Try again." : null}
        </FieldError>
      </FieldContent>
      <span className="sr-only" role="status">
        {removeMutation.isSuccess ? `Removed from ${list.title}.` : ""}
      </span>
    </Field>
  );
}

function AddToListsForm({
  lists,
  targets,
  targetCount,
  isSaving,
  addError,
  addToLists,
  close,
  onSuccess,
}: {
  readonly lists: ListOptionsForTargets["lists"];
  readonly targets: readonly ListTarget[];
  readonly targetCount: number;
  readonly isSaving: boolean;
  readonly addError: Error | null;
  readonly addToLists: (listIds: string[]) => Promise<void>;
  readonly close: () => void;
  readonly onSuccess?: () => void;
}): React.JSX.Element {
  let targetNoun: "Item" | "Collection Item" | "Order" | null = null;
  if (targets.every((target) => target.type === "item")) {
    targetNoun = "Item";
  } else if (targets.every((target) => target.type === "collectionItem")) {
    targetNoun = "Collection Item";
  } else if (targets.every((target) => target.type === "order")) {
    targetNoun = "Order";
  }
  const form = useForm({
    defaultValues: { selectedListIds: [] as string[] },
    onSubmit: async ({ value }) => {
      await addToLists(value.selectedListIds);
      close();
      onSuccess?.();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <CreateListForm
        disabled={isSaving}
        onCreated={(listId) =>
          form.setFieldValue("selectedListIds", (current) =>
            current.includes(listId) ? current : [...current, listId],
          )
        }
      />

      {lists.length === 0 ? (
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyTitle>No Lists yet</EmptyTitle>
            <EmptyDescription>Create your first List above.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            await form.handleSubmit();
          } catch {
            // The inline error stays visible and the dialog remains open.
          }
        }}
      >
        <form.Field name="selectedListIds" mode="array">
          {(field) => {
            const selectedListIdSet = new Set(field.state.value);
            return lists.length > 0 ? (
              <FieldSet>
                <FieldLegend className="sr-only">Lists</FieldLegend>
                <ScrollArea className="max-h-72 pr-3 [&_[data-slot=scroll-area-scrollbar]]:hidden">
                  <FieldGroup className="gap-3">
                    {lists.map((list) => (
                      <form.Subscribe key={list.id} selector={(state) => state.isSubmitting}>
                        {(isSubmitting) => (
                          <ListOptionRow
                            list={list}
                            targets={targets}
                            targetCount={targetCount}
                            targetNoun={targetNoun}
                            selected={selectedListIdSet.has(list.id)}
                            isSubmitting={isSubmitting}
                            onSelectedChange={(checked) =>
                              field.handleChange((current) => {
                                if (!checked) return current.filter((id) => id !== list.id);
                                return current.includes(list.id) ? current : [...current, list.id];
                              })
                            }
                            onRemoveStarted={() =>
                              field.handleChange((current) =>
                                current.filter((id) => id !== list.id),
                              )
                            }
                          />
                        )}
                      </form.Subscribe>
                    ))}
                  </FieldGroup>
                </ScrollArea>
              </FieldSet>
            ) : null;
          }}
        </form.Field>
        <form.Subscribe
          selector={(state) => [state.values.selectedListIds, state.isSubmitting] as const}
        >
          {([selectedListIds, isSubmitting]) => (
            <>
              <FieldError className="mt-4">
                {addError ? "Couldn't add to Lists. Try again." : null}
              </FieldError>
              <DialogFooter className="mt-4">
                <DialogClose
                  render={<Button type="button" variant="outline" />}
                  disabled={isSubmitting}
                >
                  Close
                </DialogClose>
                <Button type="submit" disabled={isSubmitting || selectedListIds.length === 0}>
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}

export function AddToListsDialog({
  targets,
  targetTitle,
  renderTrigger,
  open,
  onOpenChange,
  onSuccess,
}: {
  readonly targets: readonly ListTarget[];
  readonly targetTitle: string;
  readonly renderTrigger?: ReactElement;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSuccess?: () => void;
}): React.JSX.Element {
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = open ?? internalOpen;
  const addMutation = useAddTargetsToListsMutation();
  const { data, isPending, isError, error } = useListOptionsForTargetsQuery(targets, actualOpen);
  const lists = data?.lists ?? [];

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && addMutation.isPending) return;
    if (!nextOpen) addMutation.reset();
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const closeAfterSuccess = (): void => {
    if (open === undefined) setInternalOpen(false);
    onOpenChange?.(false);
  };

  return (
    <Dialog open={actualOpen} onOpenChange={handleOpenChange}>
      {renderTrigger ? <DialogTrigger render={renderTrigger} /> : null}
      {actualOpen ? (
        <DialogContent
          showCloseButton={!addMutation.isPending}
          aria-busy={isPending || addMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>Add to List</DialogTitle>
            <DialogDescription>
              Choose the Lists that should contain {targetTitle}.
            </DialogDescription>
          </DialogHeader>

          {isPending ? (
            <div className="flex flex-col gap-3 py-2" role="status">
              <span className="sr-only">Loading Lists</span>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full rounded-md" aria-hidden="true" />
              ))}
            </div>
          ) : null}

          {isError ? (
            <p className="py-6 text-center text-sm text-destructive" role="alert">
              {error.message}
            </p>
          ) : null}

          {!isPending && !isError ? (
            <AddToListsForm
              lists={lists}
              targets={targets}
              targetCount={targets.length}
              isSaving={addMutation.isPending}
              addError={addMutation.error}
              addToLists={async (listIds) => {
                addMutation.reset();
                await addMutation.mutateAsync({ targets: [...targets], listIds });
              }}
              close={closeAfterSuccess}
              onSuccess={onSuccess}
            />
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
