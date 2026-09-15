import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { NO_SCALE } from "@myakiba/contracts/shared/scale";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryColor } from "@/lib/category-colors";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleasePrice } from "@/lib/locale";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { ItemDetail } from "@/components/item/types";

export function ItemDetails({
  item,
  isLoading,
}: {
  readonly item: ItemDetail | undefined;
  readonly isLoading: boolean;
}): ReactNode {
  const { currency: userCurrency, dateFormat } = useUserPreferences();

  if (!item && !isLoading) return null;

  const releaseRows = item
    ? item.releases.map((release) => ({ key: release.id, release }))
    : [
        { key: "loading-first", release: null },
        { key: "loading-second", release: null },
      ];
  const relatedFields = item
    ? new Map<string, ReactNode[]>()
    : new Map<string, ReactNode[]>([
        ["Category", [<Skeleton key="category" className="h-5 w-24 rounded-sm" />]],
        ["Title", [<Skeleton key="title" className="h-5 w-40 rounded-sm" />]],
        ["Version", [<Skeleton key="version" className="h-5 w-32 rounded-sm" />]],
        ["Numbering", [<Skeleton key="numbering" className="h-5 w-20 rounded-sm" />]],
        ["Characters", [<Skeleton key="characters" className="h-5 w-28 rounded-sm" />]],
        ["Companies", [<Skeleton key="companies" className="h-5 w-36 rounded-sm" />]],
      ]);

  if (item) {
    const metadata = [
      { label: "Category", values: item.category ? [item.category] : [] },
      { label: "Title", values: item.mfcTitle?.trim() ? [item.mfcTitle.trim()] : [] },
      {
        label: "Version",
        values: item.version?.map((version) => version.trim()).filter(Boolean) ?? [],
      },
      { label: "Numbering", values: item.numbering?.trim() ? [item.numbering.trim()] : [] },
    ];

    for (const { label, values } of metadata) {
      if (values.length === 0) continue;
      relatedFields.set(
        label,
        values.map((value) => (
          <Badge
            key={`${label}-${value}`}
            variant={label === "Category" ? "outline" : "secondary"}
            className="animate-data-in whitespace-normal"
            style={
              label === "Category"
                ? {
                    backgroundColor: "transparent",
                    borderColor: getCategoryColor(item.category),
                    color: getCategoryColor(item.category),
                  }
                : undefined
            }
          >
            {value}
          </Badge>
        )),
      );
    }

    for (const entry of item.entries) {
      const annotations = [
        entry.roles.length > 0 ? entry.roles.join(", ") : null,
        entry.materialPercentage === null ? null : `${entry.materialPercentage}%`,
      ].filter((annotation): annotation is string => annotation !== null);
      const badge = (
        <Badge key={entry.id} variant="secondary" className="animate-data-in whitespace-normal">
          {entry.sourceLabel ?? entry.name}
          {annotations.length > 0 ? (
            <span className="text-muted-foreground ml-1">({annotations.join(" · ")})</span>
          ) : null}
        </Badge>
      );
      const categoryEntries = relatedFields.get(entry.category);
      if (categoryEntries) {
        categoryEntries.push(badge);
      } else {
        relatedFields.set(entry.category, [badge]);
      }
    }
  }

  const specifications = [
    {
      label: "Scale",
      value: item && item.scale !== NO_SCALE ? item.scale : null,
    },
    ...[
      { label: "Height", value: item?.height },
      { label: "Width", value: item?.width },
      { label: "Depth", value: item?.depth },
    ].map(({ label, value }) => ({ label, value: value == null ? null : `${value}mm` })),
  ];

  return (
    <div className="min-w-0 space-y-10 pt-8 pb-8 lg:col-span-3 lg:pr-8" aria-busy={isLoading}>
      {!item || item.releases.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-muted-foreground">Releases</h2>
          <div className="w-full min-w-0 divide-y divide-border/50">
            {releaseRows.map(({ key, release }) => (
              <div
                key={key}
                className="flex flex-wrap items-center gap-3 py-2.5 text-sm first:pt-0"
              >
                <HugeiconsIcon
                  icon={Calendar01Icon}
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                />
                {release ? (
                  <span className="animate-data-in font-medium tabular-nums">
                    {formatDateOnlyForDisplay(release.date, dateFormat)}
                  </span>
                ) : (
                  <Skeleton className="h-5 w-24" />
                )}
                {release?.type ? (
                  <Badge
                    variant="secondary"
                    size="sm"
                    className="animate-data-in whitespace-normal"
                  >
                    {release.type}
                  </Badge>
                ) : null}
                {release ? null : <Skeleton className="h-4.5 w-16 rounded-sm" />}
                {release?.barcode ? (
                  <span className="animate-data-in text-xs text-muted-foreground/60 tabular-nums">
                    {release.barcode}
                  </span>
                ) : null}
                {release ? null : <Skeleton className="h-4 w-24" />}
                {release?.price != null && release.price > 0 && release.priceCurrency?.trim() ? (
                  <span className="animate-data-in ml-auto font-medium tabular-nums">
                    {formatReleasePrice(release.price, release.priceCurrency, userCurrency)}
                  </span>
                ) : null}
                {release ? null : <Skeleton className="ml-auto h-5 w-20" />}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {relatedFields.size > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-muted-foreground">Related</h2>
          <dl className="space-y-3">
            {[...relatedFields].map(([category, entries]) => (
              <div key={category}>
                <dt className="text-xs font-medium leading-6 text-muted-foreground/70">
                  {category}
                </dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">{entries}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {!item || specifications.some(({ value }) => value !== null) ? (
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground">Specifications</h2>
          <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {specifications.map(({ label, value }) =>
              !item || value !== null ? (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {item ? (
                      <span className="animate-data-in">{value}</span>
                    ) : (
                      <Skeleton className="h-5 w-16" />
                    )}
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
