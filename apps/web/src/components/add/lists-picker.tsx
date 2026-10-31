import { Add01Icon, ArrowUpDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_COMMIT_LISTS } from "@myakiba/contracts/add/constants";
import { useId, useState } from "react";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useListMutations, useListsQuery } from "@/hooks/use-lists";
import type { ListInput } from "@myakiba/contracts/lists/schema";
import type { ChosenList } from "./commit-input";

/** Several Lists at once. "New list…" opens the existing form and chooses the List it creates. */
export function ListsPicker({
  chosen,
  onChange,
}: {
  readonly chosen: readonly ChosenList[];
  readonly onChange: (lists: readonly ChosenList[]) => void;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useListsQuery();
  const { createList } = useListMutations();
  const lists = data?.pages.flatMap((page) => page.items) ?? [];
  const chosenIds = new Set(chosen.map((list) => list.id));
  const atLimit = chosen.length >= MAX_COMMIT_LISTS;

  const handleCreate = async (input: ListInput) => {
    const created = await createList(input);
    if (created.isOk() && !atLimit) {
      onChange([...chosen, { id: created.value.id, title: input.title.trim() }]);
    }
    return created;
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" className="min-w-0 max-w-56 justify-between">
              <span className="min-w-0 truncate" title={chosen.map((l) => l.title).join(", ")}>
                {triggerLabel(chosen)}
              </span>
              <HugeiconsIcon
                icon={ArrowUpDownIcon}
                data-icon="inline-end"
                className="shrink-0 opacity-50"
                aria-hidden="true"
              />
            </Button>
          }
        />
        <PopoverContent
          aria-label="Lists"
          className="w-72 max-w-[calc(100vw-2rem)] gap-0 p-1"
          align="end"
          side="top"
        >
          <fieldset className="contents">
            <legend className="sr-only">Lists to add these to</legend>
            <div className="max-h-64 overflow-y-auto overscroll-contain">
              {lists.map((list) => {
                const checkboxId = `${baseId}-${list.id}`;
                const isChosen = chosenIds.has(list.id);
                return (
                  <label
                    key={list.id}
                    htmlFor={checkboxId}
                    className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={isChosen}
                      disabled={atLimit && !isChosen}
                      onCheckedChange={(checked) =>
                        onChange(
                          checked === true
                            ? [...chosen, { id: list.id, title: list.title }]
                            : chosen.filter((other) => other.id !== list.id),
                        )
                      }
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{list.title}</span>
                  </label>
                );
              })}
              {lists.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                  {listsStatus({ isPending, isError })}
                </p>
              ) : null}
              {hasNextPage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  Show more Lists
                </Button>
              ) : null}
            </div>
          </fieldset>
          <Button
            type="button"
            variant="ghost"
            className="mt-1 w-full justify-start"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              data-icon="inline-start"
              strokeWidth={2}
              aria-hidden="true"
            />
            New list…
          </Button>
        </PopoverContent>
      </Popover>
      <ListFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New List"
        description="Create a List and add these items to it."
        submitLabel="Create List"
        onSubmit={handleCreate}
      />
    </>
  );
}

function triggerLabel(chosen: readonly ChosenList[]): string {
  const [first] = chosen;
  if (first === undefined) return "Lists";
  return chosen.length === 1 ? first.title : `${chosen.length} Lists`;
}

function listsStatus({
  isPending,
  isError,
}: {
  readonly isPending: boolean;
  readonly isError: boolean;
}): string {
  if (isPending) return "Loading your Lists…";
  return isError ? "Couldn't load your Lists. Try again." : "No Lists yet.";
}
