import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/reui/badge";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleaseDate } from "@/lib/locale";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { ItemDetail } from "@/components/item/types";

function SectionHeading({ children }: { readonly children: React.ReactNode }): ReactNode {
  return <h2 className="text-xs font-medium text-muted-foreground">{children}</h2>;
}

export function ItemDetails({
  item,
  scale,
}: {
  readonly item: ItemDetail;
  readonly scale: string;
}): ReactNode {
  const { currency: userCurrency, dateFormat } = useUserPreferences();

  const entriesByCategory = item.entries.reduce(
    (acc, entry) => {
      if (!acc[entry.category]) {
        acc[entry.category] = [];
      }
      acc[entry.category].push(entry);
      return acc;
    },
    {} as Record<string, typeof item.entries>,
  );

  return (
    <div className="lg:col-span-3 space-y-10 lg:pr-8 pt-8 pb-8 animate-appear">
      {item.releases && item.releases.length > 0 && (
        <section className="space-y-3">
          <SectionHeading>Releases</SectionHeading>
          <div className="divide-y divide-border/50">
            {item.releases.map((release) => (
              <div key={release.id} className="flex items-center gap-3 text-sm py-2.5 first:pt-0">
                <HugeiconsIcon
                  icon={Calendar01Icon}
                  className="size-3.5 text-muted-foreground/70 shrink-0"
                />
                <span className="font-medium tabular-nums">
                  {formatDateOnlyForDisplay(release.date, dateFormat)}
                </span>
                {release.type && (
                  <Badge variant="secondary" size="sm">
                    {release.type}
                  </Badge>
                )}
                {release.barcode && (
                  <span className="text-xs text-muted-foreground/60 tabular-nums">
                    {release.barcode}
                  </span>
                )}
                {release.price != null && release.price > 0 && release.priceCurrency?.trim() && (
                  <span className="ml-auto font-medium tabular-nums">
                    {formatReleaseDate(release.price, release.priceCurrency, userCurrency)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.keys(entriesByCategory).length > 0 && (
        <section className="space-y-3">
          <SectionHeading>Related</SectionHeading>
          <div className="space-y-3">
            {Object.entries(entriesByCategory).map(([category, entries]) => (
              <div key={category}>
                <span className="text-xs font-medium text-muted-foreground/70">{category}</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {entries.map((entry) => (
                    <Badge key={entry.id} variant="secondary">
                      {entry.name}
                      {entry.role && (
                        <span className="text-muted-foreground ml-1">({entry.role})</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <SectionHeading>Specifications</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <span className="text-xs text-muted-foreground">Scale</span>
            <p className="text-sm font-medium mt-0.5">{scale}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Height</span>
            <p className="text-sm font-medium mt-0.5">{item.height ? `${item.height}mm` : "—"}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Width</span>
            <p className="text-sm font-medium mt-0.5">{item.width ? `${item.width}mm` : "—"}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Depth</span>
            <p className="text-sm font-medium mt-0.5">{item.depth ? `${item.depth}mm` : "—"}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
