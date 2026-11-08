import {
  DatabaseIcon,
  LibraryIcon,
  PackageAddIcon,
  PackageIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Fragment, useId, useState } from "react";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGlide } from "@/hooks/use-glide";
import { keyJustPressed } from "@/lib/motion-policy";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import { choiceOf, choose } from "./commit-input";
import type { ChosenList, Choice } from "./commit-input";
import { Swap, WORDS } from "./destination-motion";
import { ListsPicker } from "./lists-picker";
import { ALSO_ON, AND, APART, CHOICE_ICON, GAP, ICON_WORDS, LEAD, ICONS } from "./sentence-fit";
import { useWordsTip, WordsTip } from "./words-tip";

const CHOICES: readonly {
  readonly value: Choice;
  readonly label: string;
  readonly icon: IconSvgElement;
}[] = [
  { value: "collection", label: "Collection", icon: LibraryIcon },
  { value: "order-new", label: "New Order", icon: PackageAddIcon },
  { value: "order-existing", label: "Existing Order", icon: PackageIcon },
  { value: "none", label: "Item Database", icon: DatabaseIcon },
];

function itemsPhrase(selected: number, total: number): string {
  if (total === 0) return "items";
  const noun = total === 1 ? "item" : "items";
  return selected === total ? `${selected} ${noun}` : `${selected} of ${total} ${noun}`;
}

/** The sentence's choice. The menu separates what the rows are from where they only get recorded. */
function DestinationSelect({
  controller: c,
  disabled,
  held,
}: {
  readonly controller: AddController;
  readonly disabled: boolean;
  readonly held: boolean;
}) {
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  const chosen = CHOICES.find(({ value }) => value === choice);
  const glide = useGlide<HTMLDivElement>(choice);
  const [openedByKey, setOpenedByKey] = useState(false);
  return (
    <div ref={glide} inert={held} className="shrink-0">
      <Select
        items={CHOICES}
        value={choice}
        disabled={disabled}
        onOpenChange={() => setOpenedByKey(keyJustPressed())}
        onValueChange={(next) => {
          if (next !== null) c.setForm(choose(form, next));
        }}
      >
        <SelectTrigger
          aria-label="Where these go"
          className={cn(
            "gap-2",
            // The glide's width is the trigger's, so its edge and chevron stay whole as it grows.
            "w-full",
            chosen && "pl-2 @max-[21rem]/sentence:pl-2.5",
            choice === null &&
              !disabled &&
              "border-transparent bg-primary text-primary-foreground hover:bg-primary/85 data-placeholder:text-primary-foreground dark:bg-primary dark:hover:bg-primary/85 [&_svg]:text-primary-foreground",
          )}
        >
          <Swap
            move={WORDS}
            id={choice ?? "unset"}
            className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
          >
            {chosen ? (
              <HugeiconsIcon
                icon={chosen.icon}
                className={cn("size-4 shrink-0 text-muted-foreground", CHOICE_ICON)}
                aria-hidden="true"
              />
            ) : null}
            {/* Its own text, as the Select's reads the choice a render late, past what `useGlide` measures. */}
            <SelectValue>{chosen?.label ?? "choose where"}</SelectValue>
          </Swap>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          data-instant={openedByKey ? "" : undefined}
          className="w-52 max-w-[90vw] p-(--inset)"
        >
          {CHOICES.map(({ value, label, icon }) => (
            <Fragment key={value}>
              {value === "order-new" || value === "none" ? <SelectSeparator /> : null}
              <SelectItem value={value}>
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={icon}
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {label}
                </span>
              </SelectItem>
            </Fragment>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The destination, as one sentence that ends with what commits to it. */
export function DestinationSentence({
  controller: c,
  disabled,
  children,
}: {
  readonly controller: AddController;
  /** No rows yet: the page keeps its shape, with nothing to choose for. */
  readonly disabled: boolean;
  /** The commit, which stays out of the hold a commit in flight puts on the rest. */
  readonly children: ReactNode;
}) {
  const baseId = useId();
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  const phrase = itemsPhrase(c.selectedCount, c.rowCount);
  const lead = choice === "none" ? `Keep ${phrase} in` : `Add ${phrase} to`;
  const glide = useGlide<HTMLSpanElement>(lead, { clip: false });
  // A commit in flight holds what it was sent with, so nothing here can change under it.
  const held = c.sending;

  const {
    setWords: setWishlistWords,
    open: wishlistTipOpen,
    handleOpenChange: handleWishlistTip,
  } = useWordsTip();
  const setWishlist = (wishlist: boolean) => c.setForm({ ...form, wishlist });
  const setLists = (lists: readonly ChosenList[]) => c.setForm({ ...form, lists });

  return (
    <section aria-label="Destination" className={cn("flex items-center text-sm", GAP)}>
      <span ref={glide} className={cn("shrink-0 font-medium whitespace-nowrap tabular-nums", LEAD)}>
        <Swap move={WORDS} id={choice === "none" ? "keep" : "add"}>
          {lead}
        </Swap>
      </span>
      <DestinationSelect controller={c} disabled={disabled} held={held} />
      <span className={cn("shrink-0 text-muted-foreground @2xl/add:ms-2", ALSO_ON)}>also on</span>
      <WordsTip
        open={wishlistTipOpen}
        onOpenChange={handleWishlistTip}
        content="Wishlist"
        trigger={
          <span inert={held} className={cn("flex shrink-0 items-center gap-2", APART)}>
            <Checkbox
              id={`${baseId}-wishlist`}
              checked={form.wishlist}
              disabled={disabled}
              onCheckedChange={(checked) => setWishlist(checked === true)}
            />
            <Label
              htmlFor={`${baseId}-wishlist`}
              className={cn("font-normal", disabled ? "opacity-50" : "cursor-pointer")}
            >
              <HugeiconsIcon
                icon={StarIcon}
                strokeWidth={2}
                className={cn(
                  "size-4",
                  ICONS,
                  form.wishlist ? "[&_path]:fill-current" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span ref={setWishlistWords} className={ICON_WORDS}>
                Wishlist
              </span>
            </Label>
          </span>
        }
      />
      <span className={cn("shrink-0 text-muted-foreground", AND)}>and</span>
      <span inert={held} className="flex min-w-0">
        <ListsPicker
          chosen={form.lists}
          disabled={disabled}
          wishlist={{ checked: form.wishlist, onChange: setWishlist }}
          onChange={setLists}
        />
      </span>
      {children}
    </section>
  );
}
