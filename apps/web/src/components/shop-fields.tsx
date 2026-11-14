import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { ShopTerm } from "@myakiba/contracts/vocabulary/schema";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldTrigger } from "@/components/ui/field-trigger";
import { Skeleton } from "@/components/ui/skeleton";
import { SuggestInput } from "@/components/ui/suggest-input";
import type { Suggester } from "@/components/ui/suggest-input";
import { useRead } from "@/data/client";
import { vocabulary } from "@/data/resources/vocabulary";
import { canonicalShop, rankShops } from "@/lib/shop-suggestions";

const PLAIN: Suggester = { suggestions: () => [], canonical: (typed) => typed };

function useShopSuggester(): Suggester {
  const { data } = useRead(vocabulary);
  return useMemo(() => {
    if (!data) return PLAIN;
    return {
      suggestions: (query) => rankShops(data.shops, query),
      canonical: (typed) => canonicalShop(data.shops, typed),
    };
  }, [data]);
}

type ShopInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** A Shop field that suggests the user's shops. Leaving it or pressing Enter spells a known shop the usual way. */
export function ShopInput({ value, onValueChange, onBlur, onKeyDown, ...props }: ShopInputProps) {
  const shops = useShopSuggester();
  const commit = () => {
    const canonical = shops.canonical(value);
    if (canonical !== value) onValueChange(canonical);
  };
  return (
    <SuggestInput
      {...props}
      value={value}
      onValueChange={onValueChange}
      suggestions={shops.suggestions(value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        onKeyDown?.(event);
      }}
    />
  );
}

type InlineShopCellProps = Omit<ComponentProps<typeof InlineTextCell>, "label" | "suggester">;

export function InlineShopCell(props: InlineShopCellProps) {
  const shops = useShopSuggester();
  return <InlineTextCell label="Shop" suggester={shops} {...props} />;
}

type ShopFilterFieldProps = {
  readonly value: readonly string[];
  readonly onValueChange: (shops: string[]) => void;
  /** Which saved records the filter searches, so it lists only the shops they use, with their counts. */
  readonly uses: keyof Pick<ShopTerm, "collectionUses" | "orderUses">;
};

/** Picks shops to filter by from the user's own shops. A chosen shop no longer saved stays removable. */
export function ShopFilterField({ value, onValueChange, uses }: ShopFilterFieldProps) {
  const { data, isPending, isError } = useRead(vocabulary);
  const chosen = new Set(value);
  const shops = data?.shops.filter((term) => term[uses] > 0) ?? [];
  const toggle = (shop: string, checked: boolean) =>
    onValueChange(checked ? [...value, shop] : value.filter((current) => current !== shop));

  let options: ReactNode;
  if (isPending) {
    options = (
      <div className="flex flex-col gap-2 px-2 py-1.5" aria-hidden>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  } else if (isError) {
    options = (
      <div className="px-2 py-1.5 text-sm text-muted-foreground">Couldn&apos;t load your shops</div>
    );
  } else if (shops.length === 0) {
    options = <div className="px-2 py-1.5 text-sm text-muted-foreground">No shops yet</div>;
  } else {
    options = shops.map((term) => (
      <DropdownMenuCheckboxItem
        key={term.value}
        checked={chosen.has(term.value)}
        onCheckedChange={(checked) => toggle(term.value, checked)}
        onSelect={(event) => event.preventDefault()}
      >
        <span className="min-w-0 truncate">{term.value}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{term[uses]}</span>
      </DropdownMenuCheckboxItem>
    ));
  }

  return (
    <>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((shop) => (
            <Badge key={shop} variant="outline" className="flex items-center gap-0.5 pr-0">
              {shop}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${shop}`}
                onClick={() => toggle(shop, false)}
                className="hover:text-red-500 hover:bg-transparent!"
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<FieldTrigger>Select shops</FieldTrigger>} />
        <DropdownMenuContent className="w-(--anchor-width)">
          <div className="max-h-56 overflow-y-auto" aria-busy={isPending}>
            {options}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
