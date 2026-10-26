import { ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { SettingsGroup } from "./settings-group";
import {
  SETTINGS,
  SETTINGS_SECTIONS,
  searchSettings,
  searchTerms,
  settingHash,
} from "./settings-registry";

const RESULT_SCROLL = { block: "center" } as const;
const SEARCH_FIELD_ID = "settings-search";
const RESULT_SELECTOR = "[data-settings-result]";
const SEARCH_DEBOUNCE_MS = 120;

/** The arrow keys walk from the field into the results and back, past the nav between them. */
function focusNextResult(from: Element, step: 1 | -1) {
  const results = [...document.querySelectorAll<HTMLElement>(RESULT_SELECTOR)];
  const next = results.indexOf(from as HTMLElement) + step;
  if (next < 0) document.querySelector<HTMLElement>(`#${SEARCH_FIELD_ID}`)?.focus();
  else results[next]?.focus();
}

function countResults(query: string): number {
  return searchSettings(query).reduce((count, group) => count + group.settings.length, 0);
}

function describeResults(query: string): string {
  if (query.trim().length === 0) return "";
  const count = countResults(query);
  return `${count === 0 ? "No" : count} ${count === 1 ? "setting matches" : "settings match"} “${query.trim()}”`;
}

/** The `?q` a field's text stands for. Blank text clears the search. */
function queryOf(text: string): string {
  return text.trim() ? text : "";
}

/** `typed` text goes to `?q` once it settles. Text from the URL, or cleared on Escape or Enter, does not. */
type SearchDraft = { readonly text: string; readonly typed: boolean };

export function SettingsSearchField({ query }: { readonly query: string }) {
  const navigate = useNavigate({ from: "/settings" });
  const [draft, setDraft] = useState<SearchDraft>({ text: query, typed: false });
  const location = useLocation();
  const [seenNavigation, setSeenNavigation] = useState({ href: location.href, query });
  const settled = useDebouncedValue(draft.text, SEARCH_DEBOUNCE_MS);

  // A section link can leave the query unchanged while typing is still pending.
  if (location.href !== seenNavigation.href || query !== seenNavigation.query) {
    setSeenNavigation({ href: location.href, query });
    const queryChanged = query !== seenNavigation.query;
    // The router can publish the next location before this route's query updates.
    if (queryChanged ? query !== queryOf(settled) : (location.search.q ?? "") === query) {
      setDraft({ text: query, typed: false });
    }
  }

  useEffect(() => {
    if (!draft.typed || settled !== draft.text || queryOf(settled) === query) return;
    void navigate({
      search: (previous) => ({ ...previous, q: queryOf(settled) || undefined }),
      replace: true,
    });
  }, [draft, settled, query, navigate]);

  return (
    <div role="search" className="flex flex-col">
      <InputGroup className="h-9 md:h-8">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id={SEARCH_FIELD_ID}
          type="search"
          aria-label="Search settings"
          placeholder="Search settings"
          autoComplete="off"
          enterKeyHint="go"
          className="[&::-webkit-search-cancel-button]:hidden"
          value={draft.text}
          onChange={(event) => setDraft({ text: event.target.value, typed: true })}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusNextResult(event.currentTarget, 1);
            }
            if (event.key === "Escape" && draft.text !== "") {
              setDraft({ text: "", typed: false });
              void navigate({
                search: (previous) => ({ ...previous, q: undefined }),
                replace: true,
              });
            }
            if (event.key === "Enter") {
              const first = searchSettings(draft.text)[0];
              const setting = first?.settings[0];
              if (first && setting !== undefined) {
                setDraft({ text: "", typed: false });
                void navigate({
                  search: { section: first.section },
                  hash: settingHash(setting),
                  hashScrollIntoView: RESULT_SCROLL,
                });
              }
            }
          }}
        />
      </InputGroup>
      <p role="status" className="sr-only">
        {describeResults(query)}
      </p>
    </div>
  );
}

export function SettingsSearchResults({ query }: { readonly query: string }) {
  const groups = searchSettings(query);
  const terms = searchTerms(query);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-medium tracking-tight">Search results</h2>
        <p className="text-sm text-muted-foreground">{describeResults(query)}</p>
      </header>
      {groups.length === 0 ? (
        <p className="text-pretty text-sm text-muted-foreground">
          Try a broader word, like “currency”, “password” or “export”.
        </p>
      ) : (
        groups.map(({ section, settings }) => (
          <SettingsGroup key={section} title={SETTINGS_SECTIONS[section].label}>
            {settings.map((id) => (
              <Link
                key={id}
                to="/settings"
                search={{ section }}
                hash={settingHash(id)}
                hashScrollIntoView={RESULT_SCROLL}
                data-settings-result=""
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  event.preventDefault();
                  focusNextResult(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
                }}
                className="group/result flex items-center gap-4 px-4 py-3 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    <Highlight text={SETTINGS[id].title} terms={terms} />
                  </span>
                  <span className="text-pretty text-[13px] leading-snug text-muted-foreground">
                    <Highlight text={SETTINGS[id].description} terms={terms} />
                  </span>
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-4 shrink-0 text-muted-foreground/60 group-hover/result:text-foreground"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </SettingsGroup>
        ))
      )}
    </div>
  );
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function Highlight({ text, terms }: { readonly text: string; readonly terms: readonly string[] }) {
  if (terms.length === 0) return text;
  const pattern = `(?<![\\p{L}\\p{N}])(${terms.map(escapeRegExp).join("|")})`;
  const parts = text.split(new RegExp(pattern, "giu"));
  let offset = 0;
  return parts.map((part, index) => {
    const start = offset;
    offset += part.length;
    return index % 2 === 1 ? (
      <mark key={start} className="rounded-[3px] bg-foreground/10 text-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={`text-${start}`}>{part}</Fragment>
    );
  });
}
