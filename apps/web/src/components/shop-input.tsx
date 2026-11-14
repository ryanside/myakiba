import { useMemo } from "react";
import type { ComponentProps } from "react";
import { InlineTextCell } from "@/components/cells/inline-text-cell";
import { SuggestInput } from "@/components/ui/suggest-input";
import type { Suggester } from "@/components/ui/suggest-input";
import { useRead } from "@/data/client";
import { vocabulary } from "@/data/resources/vocabulary";
import { canonicalShop, rankShops } from "@/lib/shop-suggestions";

const PLAIN: Suggester = { suggestions: () => [], canonical: (typed) => typed };

/** Suggests the user's own shops. Until they load, it suggests nothing and saves what was typed. */
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

/** A Shop field that suggests the user's shops and, on leaving it, saves a known shop's usual spelling. */
export function ShopInput({ value, onValueChange, onBlur, ...props }: ShopInputProps) {
  const shops = useShopSuggester();
  return (
    <SuggestInput
      {...props}
      value={value}
      onValueChange={onValueChange}
      suggestions={shops.suggestions(value)}
      onBlur={(event) => {
        const canonical = shops.canonical(value);
        if (canonical !== value) onValueChange(canonical);
        onBlur?.(event);
      }}
    />
  );
}

type InlineShopCellProps = Omit<ComponentProps<typeof InlineTextCell>, "label" | "suggester">;

export function InlineShopCell(props: InlineShopCellProps) {
  const shops = useShopSuggester();
  return <InlineTextCell label="Shop" suggester={shops} {...props} />;
}
