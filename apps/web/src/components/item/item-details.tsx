import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  isLoading,
}: {
  readonly item: ItemDetail | undefined;
  readonly scale: string;
  readonly isLoading: boolean;
}): ReactNode {
  const { currency: userCurrency, dateFormat } = useUserPreferences();

  if (isLoading) {
    return (
      <div className="space-y-10 pt-8 pb-8 lg:col-span-3 lg:pr-8" aria-busy="true">
        <section className="space-y-3">
          <SectionHeading>Releases</SectionHeading>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <HugeiconsIcon
                  icon={Calendar01Icon}
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeading>Related</SectionHeading>
          <div className="space-y-3">
            {[
              { headingWidth: "w-20", badgeWidths: ["w-28", "w-20", "w-32"] },
              { headingWidth: "w-16", badgeWidths: ["w-24", "w-36"] },
            ].map(({ headingWidth, badgeWidths }) => (
              <div key={headingWidth} className="space-y-2">
                <Skeleton className={`h-3 ${headingWidth}`} />
                <div className="flex flex-wrap gap-1.5">
                  {badgeWidths.map((width) => (
                    <Skeleton key={width} className={`h-6 rounded-full ${width}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <SectionHeading>Specifications</SectionHeading>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {["Scale", "Height", "Width", "Depth"].map((label) => (
              <div key={label}>
                <span className="text-xs text-muted-foreground">{label}</span>
                <Skeleton className="mt-0.5 h-4 w-16" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (!item) return null;

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
    <div className="space-y-10 pt-8 pb-8 lg:col-span-3 lg:pr-8">
      {item.releases && item.releases.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading>Releases</SectionHeading>
          <div className="divide-y divide-border/50">
            {item.releases.map((release) => (
              <div key={release.id} className="flex items-center gap-3 text-sm py-2.5 first:pt-0">
                <HugeiconsIcon
                  icon={Calendar01Icon}
                  className="size-3.5 text-muted-foreground/70 shrink-0"
                />
                <span className="animate-data-in font-medium tabular-nums">
                  {formatDateOnlyForDisplay(release.date, dateFormat)}
                </span>
                {release.type ? (
                  <Badge variant="secondary" size="sm" className="animate-data-in">
                    {release.type}
                  </Badge>
                ) : null}
                {release.barcode ? (
                  <span className="animate-data-in text-xs text-muted-foreground/60 tabular-nums">
                    {release.barcode}
                  </span>
                ) : null}
                {release.price != null && release.price > 0 && release.priceCurrency?.trim() ? (
                  <span className="animate-data-in ml-auto font-medium tabular-nums">
                    {formatReleaseDate(release.price, release.priceCurrency, userCurrency)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {Object.keys(entriesByCategory).length > 0 ? (
        <section className="space-y-3">
          <SectionHeading>Related</SectionHeading>
          <div className="space-y-3">
            {Object.entries(entriesByCategory).map(([category, entries]) => (
              <div key={category}>
                <span className="animate-data-in text-xs font-medium text-muted-foreground/70">
                  {category}
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {entries.map((entry) => (
                    <Badge key={entry.id} variant="secondary" className="animate-data-in">
                      {entry.name}
                      {entry.role ? (
                        <span className="text-muted-foreground ml-1">({entry.role})</span>
                      ) : null}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <SectionHeading>Specifications</SectionHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <span className="text-xs text-muted-foreground">Scale</span>
            <p className="animate-data-in text-sm font-medium mt-0.5">{scale}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Height</span>
            <p className="animate-data-in text-sm font-medium mt-0.5">
              {item.height ? `${item.height}mm` : "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Width</span>
            <p className="animate-data-in text-sm font-medium mt-0.5">
              {item.width ? `${item.width}mm` : "—"}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Depth</span>
            <p className="animate-data-in text-sm font-medium mt-0.5">
              {item.depth ? `${item.depth}mm` : "—"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
