import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcSearchUrl } from "@myakiba/contracts/add/constants";
import { DEFAULT_PAGE_SIZE } from "@myakiba/contracts/shared/constants";
import { useRef, useState } from "react";
import type { RefObject } from "react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandItem, CommandList, CommandPageInput } from "@/components/ui/command";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRead } from "@/data/client";
import { add } from "@/data/resources/add";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleasePrice } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { ItemBadges } from "./item-badges";
import { THUMBNAIL } from "./row-fields";

const SEARCH_DEBOUNCE_MS = 250;

/** Words a narrow table's last row leaves to screen readers, so both its actions fit on one line. */
export const NARROW_HIDDEN = "@max-[26rem]/grid:sr-only";

/**
 * A search of the Items already in myakiba, one small part of what the extension can reach, so it
 * waits behind a button quieter than the way to MFC. Text that looks like an MFC link or id is searched as text.
 */
export function AddSearch({
  initialQuery,
  draftItemIds,
  open,
  triggerRef,
  onOpenChange,
  onAdd,
}: {
  readonly initialQuery: string;
  readonly draftItemIds: ReadonlySet<string>;
  readonly open: boolean;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAdd: (item: { readonly itemId: string; readonly title: string }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialQuery);
  const query = text.trim();
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const { currency, dateFormat } = useUserPreferences();
  const { data, isError, isPending, isPlaceholderData } = useRead(
    add.search,
    { query: debouncedQuery, page: 1, pageSize: DEFAULT_PAGE_SIZE },
    { enabled: debouncedQuery.length > 0 },
  );
  const results = debouncedQuery.length > 0 ? (data?.items ?? []) : [];
  // Busy from the first keystroke until the answer to the words on screen, even with no earlier list.
  const stale = query !== debouncedQuery || isPlaceholderData || isPending;
  const showResults = query.length > 0;

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next && !focusIsOnAControl()) triggerRef.current?.focus({ preventScroll: true });
      }}
    >
      <PopoverTrigger
        render={
          <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="sm"
            className="font-normal text-muted-foreground"
          >
            <span className={NARROW_HIDDEN}>Search </span>myakiba
          </Button>
        }
      />
      <PopoverContent
        aria-label="Add from myakiba"
        initialFocus={input}
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] gap-0 p-0"
      >
        <search>
          <p role="status" className="sr-only">
            {showResults && !stale ? resultsAnnouncement(results.length, isError) : ""}
          </p>
          <Command
            shouldFilter={false}
            loop
            label="Search myakiba"
            className="bg-transparent p-0 [--inset:--spacing(1)]"
          >
            <div className="p-2">
              <CommandPageInput
                ref={(element) => {
                  input.current = element;
                  // cmdk always writes aria-expanded="true", which is false while there is no list.
                  element?.setAttribute("aria-expanded", String(showResults));
                }}
                value={text}
                onValueChange={setText}
                placeholder="Search by title, MFC ID, or entry"
                className="text-ellipsis"
              />
            </div>
            {/* Keeps focus in the input when a result or the footer is clicked. */}
            <div
              role="presentation"
              className="flex max-h-[min(26rem,55dvh)] flex-col overflow-hidden"
              onMouseDown={(event) => event.preventDefault()}
            >
              {showResults ? (
                <CommandList
                  className="max-h-none min-h-0 flex-1 border-t border-foreground/10 p-1"
                  aria-busy={stale}
                >
                  {results.map((item) => {
                    const added = draftItemIds.has(item.itemId);
                    const release = item.latestRelease;
                    const date = release?.date
                      ? formatDateOnlyForDisplay(release.date, dateFormat)
                      : null;
                    const price = release
                      ? formatReleasePrice(release.price, release.priceCurrency, currency)
                      : null;
                    return (
                      <CommandItem
                        key={item.itemId}
                        value={item.itemId}
                        disabled={added}
                        onSelect={() => {
                          // Enter must never add a result of the words typed before the current ones.
                          if (stale) return;
                          onAdd({ itemId: item.itemId, title: item.title });
                          setText("");
                        }}
                        className={cn(
                          "gap-3 py-2 data-[disabled=true]:opacity-60",
                          stale && "opacity-60",
                        )}
                      >
                        <ImageThumbnail
                          images={item.image ? [item.image] : []}
                          title={item.title}
                          decorative
                          className={THUMBNAIL}
                          fallbackIcon={null}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">
                            {item.title}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                            {date ? <span>{date}</span> : null}
                            {price ? <span>{price}</span> : null}
                            <ItemBadges item={item} />
                          </span>
                        </span>
                        {added ? (
                          <Badge variant="secondary" size="sm" className="self-center">
                            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} aria-hidden="true" />
                            Added
                          </Badge>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                  {results.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {searchStatus({ isError, searching: stale })}
                    </p>
                  ) : null}
                </CommandList>
              ) : null}
              <a
                href={mfcSearchUrl(query)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border-t border-foreground/10 px-3.5 py-2.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {showResults ? `Not here? Search MFC for ‘${query}’` : "Not here? Search MFC"}
                </span>
              </a>
            </div>
          </Command>
        </search>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A click on the page focuses `main` after the popover has closed, too late for its own return of
 * focus. `main` takes focus without being a place to work from, and a clicked control is one.
 */
function focusIsOnAControl(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.tabIndex >= 0 && active !== document.body;
}

function resultsAnnouncement(count: number, isError: boolean): string {
  if (isError) return "Couldn't search myakiba.";
  if (count === 0) return "No items match in myakiba.";
  return count === 1 ? "1 item found" : `${count} items found`;
}

function searchStatus({
  isError,
  searching,
}: {
  readonly isError: boolean;
  readonly searching: boolean;
}): string {
  if (searching) return "Searching…";
  return isError ? "Couldn't search myakiba. Try again." : "No items match in myakiba.";
}
