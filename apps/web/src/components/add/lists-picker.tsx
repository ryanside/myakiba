import { Add01Icon, Folder01Icon, StarIcon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_COMMIT_LISTS } from "@myakiba/contracts/add/constants";
import { useEffect, useId, useState } from "react";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useListMutations, useListsQuery } from "@/hooks/use-lists";
import { cn } from "@/lib/utils";
import type { ListInput } from "@myakiba/contracts/lists/schema";
import { namedTargets } from "./commit-input";
import type { ChosenList } from "./commit-input";
import { APART, FOLDED, ICONS, ICON_WORDS, WORDS_ONLY } from "./sentence-fit";
import { useWordsTip, WordsTip } from "./words-tip";

/** Whether the Wishlist is chosen, for the trigger that holds it with the Lists. */
type WishlistChoice = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
};

/**
 * Several Lists at once. "New list…" opens the existing form and chooses the List it creates. The
 * narrowest sentence has room for one control, so there the trigger folds the Wishlist in with the
 * Lists, and the popup offers it too.
 */
export function ListsPicker({
  chosen,
  disabled,
  wishlist,
  onChange,
}: {
  readonly chosen: readonly ChosenList[];
  readonly disabled?: boolean;
  readonly wishlist: WishlistChoice;
  readonly onChange: (lists: readonly ChosenList[]) => void;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [foldedFace, setFoldedFace] = useState<HTMLElement | null>(null);
  const folded = useShown(foldedFace);
  const { setWords, open: tipOpen, handleOpenChange: handleTip } = useWordsTip();
  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useListsQuery();
  const { createList } = useListMutations();
  const lists = data?.pages.flatMap((page) => page.items) ?? [];
  const chosenIds = new Set(chosen.map((list) => list.id));
  const atLimit = chosen.length >= MAX_COMMIT_LISTS;
  const name = triggerLabel(chosen);
  const held = namedTargets(wishlist.checked ? "Wishlist" : null, chosen);
  const heldName = held === null ? "Wishlist and Lists" : `Also on ${held}`;
  const rowClass =
    "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 text-sm hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50";
  let tip = `Lists: ${titlesOf(chosen)}`;
  if (folded) tip = heldName;
  else if (chosen.length === 0) tip = name;

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
        <WordsTip
          open={tipOpen}
          onOpenChange={handleTip}
          content={tip}
          trigger={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  className="max-w-56 min-w-0 justify-between pr-2"
                >
                  {/* One trigger with a face for each width, so the popup it opened stays with it.
                  The stylesheet shows one face, and the name is the words of the face it shows. */}
                  <span className={cn("contents", APART)}>
                    <span
                      ref={setWords}
                      aria-hidden={folded || undefined}
                      className={cn("min-w-0 truncate", ICON_WORDS)}
                    >
                      {name}
                    </span>
                    <HugeiconsIcon
                      icon={UnfoldMoreIcon}
                      strokeWidth={2}
                      className={cn("shrink-0 text-muted-foreground", WORDS_ONLY)}
                      aria-hidden="true"
                    />
                    <span aria-hidden="true" className={cn("items-center gap-1", ICONS)}>
                      <ListsCount chosen={chosen} />
                    </span>
                  </span>
                  <span className={FOLDED}>
                    <span ref={setWords} aria-hidden={!folded || undefined} className="sr-only">
                      {heldName}
                    </span>
                    {/* The trigger keeps one padding, so a resize has nothing to animate, and this
                    face makes up the end it has without the chevron. */}
                    <span
                      ref={setFoldedFace}
                      aria-hidden="true"
                      className="me-0.5 flex items-center gap-1"
                    >
                      <HugeiconsIcon
                        icon={StarIcon}
                        strokeWidth={2}
                        className={
                          wishlist.checked ? "[&_path]:fill-current" : "text-muted-foreground"
                        }
                      />
                      <ListsCount chosen={chosen} />
                    </span>
                  </span>
                </Button>
              }
            />
          }
        />
        <PopoverContent
          aria-label={folded ? "Wishlist and Lists" : "Lists"}
          className="w-72 max-w-[calc(100vw-2rem)] gap-0 p-1"
          align="end"
        >
          {folded ? (
            <>
              <label htmlFor={`${baseId}-wishlist`} className={rowClass}>
                <Checkbox
                  id={`${baseId}-wishlist`}
                  checked={wishlist.checked}
                  onCheckedChange={(checked) => wishlist.onChange(checked === true)}
                />
                Wishlist
              </label>
              <Separator className="my-1" />
            </>
          ) : null}
          <fieldset className="contents">
            <legend className="sr-only">Lists to add these to</legend>
            <div className="max-h-64 overflow-y-auto overscroll-contain">
              {lists.map((list) => {
                const checkboxId = `${baseId}-${list.id}`;
                const isChosen = chosenIds.has(list.id);
                return (
                  <label key={list.id} htmlFor={checkboxId} className={rowClass}>
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

/** The Lists' state in an icon and how many are chosen, for a trigger too narrow for their words. */
function ListsCount({ chosen }: { readonly chosen: readonly ChosenList[] }) {
  return (
    <>
      <HugeiconsIcon
        icon={Folder01Icon}
        strokeWidth={2}
        className={chosen.length === 0 ? "text-muted-foreground" : undefined}
      />
      {chosen.length > 0 ? <span className="tabular-nums">{chosen.length}</span> : null}
    </>
  );
}

function titlesOf(chosen: readonly ChosenList[]): string {
  return chosen.map((list) => list.title).join(", ");
}

function triggerLabel(chosen: readonly ChosenList[]): string {
  const [first] = chosen;
  if (first === undefined) return "Lists";
  return chosen.length === 1 ? first.title : `${chosen.length} Lists`;
}

/** Whether `element` shows: a container query hides or shows it, so only its size can tell. */
function useShown(element: HTMLElement | null): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setShown((entry?.contentRect.width ?? 0) > 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return shown;
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
