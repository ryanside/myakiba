import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcSearchUrl } from "@myakiba/contracts/add/constants";
import { DEFAULT_PAGE_SIZE } from "@myakiba/contracts/shared/constants";
import { useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import { Badge } from "@/components/reui/badge";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { useRead } from "@/data/client";
import { add } from "@/data/resources/add";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleasePrice } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { ItemBadges } from "./item-badges";

const SEARCH_DEBOUNCE_MS = 250;

/** One combobox over the Item Database. Text that looks like an MFC link or id is searched as text. */
export function AddSearch({
  initialQuery,
  draftItemIds,
  inputRef,
  onAdd,
}: {
  readonly initialQuery: string;
  readonly draftItemIds: ReadonlySet<string>;
  readonly inputRef: Ref<HTMLInputElement>;
  readonly onAdd: (item: { readonly itemId: string; readonly title: string }) => void;
}) {
  const container = useRef<HTMLElement>(null);
  const [text, setText] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const query = text.trim();
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const { currency, dateFormat } = useUserPreferences();
  const { data, isError, isPending, isPlaceholderData } = useRead(
    add.search,
    { query: debouncedQuery, page: 1, pageSize: DEFAULT_PAGE_SIZE },
    { enabled: debouncedQuery.length > 0 },
  );
  const results = debouncedQuery.length > 0 ? (data?.items ?? []) : [];
  const stale = query !== debouncedQuery || isPlaceholderData;
  const showPanel = open && query.length > 0;

  // cmdk always writes aria-expanded="true", which is false while this panel is closed.
  useEffect(() => {
    container.current?.querySelector("input")?.setAttribute("aria-expanded", String(showPanel));
  });

  return (
    <search
      ref={container}
      className="relative w-full max-w-2xl"
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <p role="status" className="sr-only">
        {showPanel && !stale && !isPending ? resultsAnnouncement(results.length, isError) : ""}
      </p>
      <Command
        shouldFilter={false}
        loop
        label="Search the Item Database"
        className="overflow-visible bg-transparent p-0"
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <CommandInput
          ref={inputRef}
          value={text}
          onValueChange={(next) => {
            setText(next);
            setOpen(true);
          }}
          placeholder="Search myakiba by title, MFC ID, or entry"
          className="text-base md:text-sm"
        />
        {showPanel ? (
          <div
            className="absolute inset-x-0 top-full z-30 mt-1 flex max-h-[min(26rem,55dvh)] flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
            role="presentation"
            // Keeps focus in the input when a result or the footer is clicked.
            onMouseDown={(event) => event.preventDefault()}
          >
            <CommandList className="max-h-none min-h-0 flex-1 p-1" aria-busy={stale}>
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
                      "items-start gap-3 rounded-lg py-2 data-[disabled=true]:opacity-60",
                      stale && "opacity-60",
                    )}
                  >
                    <ImageThumbnail
                      images={item.image ? [item.image] : []}
                      title={item.title}
                      decorative
                      className="size-12 shrink-0 rounded-md outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                      fallbackIcon={null}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">
                        {item.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                        {date ? <span>{date}</span> : null}
                        {price ? <span>{price}</span> : null}
                        <ItemBadges
                          collectionCount={item.collectionCount}
                          wishlisted={item.wishlisted}
                        />
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
                  {searchStatus({ isError, searching: stale || isPending })}
                </p>
              ) : null}
            </CommandList>
            <a
              href={mfcSearchUrl(query)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border-t border-foreground/10 px-3.5 py-2.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <HugeiconsIcon
                icon={Search01Icon}
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                Not here? Search MFC for ‘{query}’
              </span>
            </a>
          </div>
        ) : null}
      </Command>
    </search>
  );
}

function resultsAnnouncement(count: number, isError: boolean): string {
  if (isError) return "Couldn't search the Item Database.";
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
  return isError ? "Couldn't search the Item Database. Try again." : "No items match in myakiba.";
}
