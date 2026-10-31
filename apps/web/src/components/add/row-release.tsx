import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRead, useReads } from "@/data/client";
import { items } from "@/data/resources/item";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleasePrice } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import type { DraftRow } from "./add-draft";
import { LabeledField } from "./add-fields";
import type { AddItem } from "./commit-input";
import { DEFAULT_VALUE, SET_VALUE } from "./row-fields";

type Release = NonNullable<AddItem["latestRelease"]>;

/**
 * The release each row saves with: its choice once that has loaded, else the Item's latest. Only a
 * row with a choice reads anything, so a hundred untouched rows make no request.
 */
export function useRowReleases(rows: readonly DraftRow[]) {
  const chosen = rows.filter((row) => row.overrides.releaseId !== undefined);
  const reads = useReads(
    items.releases,
    chosen.map((row) => row.itemId),
  );
  const loaded = new Map(
    chosen.map((row, index) => [
      row.itemId,
      reads[index]?.data?.releases.find((release) => release.id === row.overrides.releaseId),
    ]),
  );
  return (row: DraftRow, item: AddItem): AddItem["latestRelease"] =>
    loaded.get(row.itemId) ?? item.latestRelease;
}

function releaseFacts(release: Release, c: AddController): readonly string[] {
  return [
    formatDateOnlyForDisplay(release.date, c.dateFormat),
    release.type,
    release.barcode,
    formatReleasePrice(release.price, release.priceCurrency, c.currency),
  ].filter((fact): fact is string => Boolean(fact));
}

/** A row's release, in the release's own currency. Its options load when the menu first opens. */
export function ReleaseField({
  row,
  item,
  release,
  c,
}: {
  readonly row: DraftRow;
  readonly item: AddItem;
  readonly release: AddItem["latestRelease"];
  readonly c: AddController;
}) {
  const { itemId, overrides } = row;
  const id = `add-release-${itemId}`;
  const [opened, setOpened] = useState(false);
  const { data, isLoading, error } = useRead(items.releases, itemId, { enabled: opened });
  const price = (option: Release) =>
    formatReleasePrice(option.price, option.priceCurrency, c.currency);

  return (
    <LabeledField
      id={id}
      className="grid-cols-[minmax(0,1fr)]"
      label={
        <>
          Release<span className="sr-only"> for {item.title}</span>
        </>
      }
    >
      <Select
        value={release?.id ?? ""}
        disabled={release === null}
        onOpenChange={(open) => {
          if (open) setOpened(true);
        }}
        onValueChange={(next) => {
          if (next) c.edit(itemId, { releaseId: next });
        }}
      >
        <SelectTrigger
          id={id}
          title={release ? releaseFacts(release, c).join(", ") : undefined}
          className={cn("w-full", release === null && DEFAULT_VALUE)}
        >
          <SelectValue placeholder="No release">
            {release ? (
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground tabular-nums @max-3xl/rows:gap-1.5 @max-3xl/rows:text-xs">
                <span
                  className={cn(
                    "shrink-0",
                    overrides.releaseId === undefined ? DEFAULT_VALUE : SET_VALUE,
                  )}
                >
                  {formatDateOnlyForDisplay(release.date, c.dateFormat)}
                </span>
                {release.type ? <span className="truncate">{release.type}</span> : null}
                {release.barcode ? <span className="shrink-0">{release.barcode}</span> : null}
                {price(release) ? <span className="shrink-0">{price(release)}</span> : null}
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          className="w-auto max-w-[calc(100vw-2rem)] min-w-64"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading releases…
            </div>
          ) : null}
          {error ? <div className="p-3 text-sm text-destructive">{error.message}</div> : null}
          {data?.releases.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {formatDateOnlyForDisplay(option.date, c.dateFormat)}
                  </span>
                  {option.type ? (
                    <span className="rounded bg-muted/60 px-1.5 py-px text-xs text-muted-foreground">
                      {option.type}
                    </span>
                  ) : null}
                </span>
                {option.barcode || price(option) ? (
                  <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                    {option.barcode ? <span>{option.barcode}</span> : null}
                    {price(option) ? <span>{price(option)}</span> : null}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </LabeledField>
  );
}
