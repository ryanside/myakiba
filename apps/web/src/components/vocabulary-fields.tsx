import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import type { ComponentProps, ReactNode } from "react";
import { NO_SCALE } from "@myakiba/contracts/shared/scale";
import type { VocabularyResponse } from "@myakiba/contracts/vocabulary/schema";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { ChipsInput } from "@/components/ui/chips-input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldTrigger } from "@/components/ui/field-trigger";
import { Skeleton } from "@/components/ui/skeleton";
import { SuggestInput } from "@/components/ui/suggest-input";
import { useRead } from "@/data/client";
import { vocabulary } from "@/data/resources/vocabulary";
import { rankTerms } from "@/lib/vocabulary-suggestions";

export const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

const NO_SUGGESTIONS = () => [];

function useSuggestions(kind: "shops" | "tags"): (query: string) => readonly string[] {
  const { data } = useRead(vocabulary);
  return useMemo(
    () => (data ? (query: string) => rankTerms(data[kind], query) : NO_SUGGESTIONS),
    [data, kind],
  );
}

type ShopInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** A Shop field that suggests the user's shops and saves what the user typed or picked. */
export function ShopInput({ value, onValueChange, ...props }: ShopInputProps) {
  const suggest = useSuggestions("shops");
  return (
    <SuggestInput
      {...props}
      value={value}
      onValueChange={onValueChange}
      suggestions={suggest(value)}
    />
  );
}

type InlineShopCellProps = Omit<ComponentProps<typeof InlineTextCell>, "label" | "suggest">;

export function InlineShopCell(props: InlineShopCellProps) {
  const suggest = useSuggestions("shops");
  return <InlineTextCell label="Shop" suggest={suggest} {...props} />;
}

type TagsInputProps = Omit<
  ComponentProps<typeof ChipsInput>,
  "suggest" | "noun" | "maxValues" | "maxLength"
>;

/** A Tags field that suggests the user's tags and saves what the user typed or picked. */
export function TagsInput(props: TagsInputProps) {
  const suggest = useSuggestions("tags");
  return (
    <ChipsInput
      {...props}
      noun="tag"
      suggest={suggest}
      maxValues={MAX_TAGS}
      maxLength={MAX_TAG_LENGTH}
    />
  );
}

type FilterTerm = { readonly value: string; readonly count: number };

type VocabularyFilter = {
  readonly noun: string;
  /** The terms the filter's records use, each with how many of those records it would match. */
  readonly terms: (vocabulary: VocabularyResponse) => FilterTerm[];
  readonly label?: (value: string) => string;
};

const VOCABULARY_FILTERS = {
  collectionShops: {
    noun: "shops",
    terms: ({ shops }) => shops.map(({ value, ownedUses }) => ({ value, count: ownedUses })),
  },
  orderShops: {
    noun: "shops",
    terms: ({ shops }) => shops.map(({ value, orderUses }) => ({ value, count: orderUses })),
  },
  collectionTags: {
    noun: "tags",
    terms: ({ tags }) => tags.map(({ value, ownedUses }) => ({ value, count: ownedUses })),
  },
  collectionScales: {
    noun: "scales",
    terms: ({ scales }) => scales.map(({ value, ownedUses }) => ({ value, count: ownedUses })),
    label: (scale) => (scale === NO_SCALE ? `${NO_SCALE} (non-scale)` : scale),
  },
} satisfies Record<string, VocabularyFilter>;

type VocabularyFilterFieldProps = {
  readonly filter: keyof typeof VOCABULARY_FILTERS;
  readonly value: readonly string[];
  readonly onValueChange: (values: string[]) => void;
};

/** Picks values to filter by from the user's own terms. A chosen value no longer saved stays removable. */
export function VocabularyFilterField({
  filter,
  value,
  onValueChange,
}: VocabularyFilterFieldProps) {
  const {
    noun,
    terms,
    label = (term: string) => term,
  }: VocabularyFilter = VOCABULARY_FILTERS[filter];
  const { data, isPending, isError } = useRead(vocabulary);
  const chosen = new Set(value);
  const options = data
    ? terms(data)
        .filter((term) => term.count > 0)
        .toSorted((a, b) => b.count - a.count)
    : [];
  const toggle = (term: string, checked: boolean) =>
    onValueChange(checked ? [...value, term] : value.filter((current) => current !== term));

  let menu: ReactNode;
  if (isPending) {
    menu = (
      <div className="flex flex-col gap-2 px-2 py-1.5" aria-hidden>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  } else if (isError) {
    menu = (
      <div className="px-2 py-1.5 text-sm text-muted-foreground">
        Couldn&apos;t load your {noun}
      </div>
    );
  } else if (options.length === 0) {
    menu = <div className="px-2 py-1.5 text-sm text-muted-foreground">No {noun} yet</div>;
  } else {
    menu = options.map((term) => (
      <DropdownMenuCheckboxItem
        key={term.value}
        checked={chosen.has(term.value)}
        onCheckedChange={(checked) => toggle(term.value, checked)}
        onSelect={(event) => event.preventDefault()}
      >
        <span className="min-w-0 truncate">{label(term.value)}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{term.count}</span>
      </DropdownMenuCheckboxItem>
    ));
  }

  return (
    <>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((term) => (
            <Badge key={term} variant="outline" className="flex items-center gap-0.5 pr-0">
              {label(term)}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label(term)}`}
                onClick={() => toggle(term, false)}
                className="hover:text-red-500 hover:bg-transparent!"
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<FieldTrigger>Select {noun}</FieldTrigger>} />
        <DropdownMenuContent className="w-(--anchor-width)">
          <div className="max-h-56 overflow-y-auto" aria-busy={isPending}>
            {menu}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
