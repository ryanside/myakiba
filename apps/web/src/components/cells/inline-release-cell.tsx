import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { useQuery } from "@tanstack/react-query";
import { searchReleases } from "@/queries/search";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { formatReleaseDate } from "@/lib/locale";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";

type ReleaseFallback = {
  readonly releaseDate: string | null;
  readonly releaseType: string | null;
  readonly releasePrice: number | null;
  readonly releaseCurrency: string | null;
  readonly releaseBarcode: string | null;
};

interface InlineReleaseCellProps {
  readonly releaseId: string | null;
  readonly itemId: string;
  readonly fallback: ReleaseFallback;
  readonly currency: Currency;
  readonly dateFormat?: DateFormat;
  readonly disabled?: boolean;
  readonly onSubmit: (releaseId: string) => Promise<void>;
}

export function InlineReleaseCell({
  releaseId,
  itemId,
  fallback,
  currency,
  dateFormat,
  disabled = false,
  onSubmit,
}: InlineReleaseCellProps) {
  const {
    data: releasesData,
    isLoading: releasesLoading,
    error: releasesError,
    refetch: refetchReleases,
  } = useQuery({
    queryKey: ["itemReleases", itemId],
    queryFn: () => searchReleases(itemId),
    staleTime: 1000 * 60 * 5,
    retry: false,
    enabled: false,
  });

  const selectedRelease = releasesData?.releases.find((r) => r.id === releaseId);
  const displayData = selectedRelease ?? {
    date: fallback.releaseDate,
    type: fallback.releaseType,
    price: fallback.releasePrice,
    priceCurrency: fallback.releaseCurrency,
    barcode: fallback.releaseBarcode,
  };

  return (
    <Field>
      <Select
        value={releaseId ?? ""}
        onValueChange={(value: string | null) => {
          if (value) onSubmit(value);
        }}
        onOpenChange={(open) => {
          if (open) refetchReleases();
        }}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select release">
            {releaseId && displayData.date && (
              <span className="text-sm font-medium">
                {formatDateOnlyForDisplay(displayData.date, dateFormat)}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="w-auto min-w-64">
          {releasesLoading && (
            <div className="flex items-center justify-center py-4 px-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading releases...</span>
            </div>
          )}
          {releasesError && (
            <div className="py-3 px-3 text-sm text-destructive">{releasesError.message}</div>
          )}
          {releasesData?.releases.map((release) => (
            <SelectItem key={release.id} value={release.id} className="py-2.5">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {formatDateOnlyForDisplay(release.date, dateFormat)}
                  </span>
                  {release.type && (
                    <span className="text-xs text-muted-foreground/80 bg-muted/60 px-1.5 py-px rounded">
                      {release.type}
                    </span>
                  )}
                </div>
                {((release.price != null && release.price > 0 && release.priceCurrency?.trim()) ||
                  release.barcode) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {release.price != null &&
                      release.price > 0 &&
                      release.priceCurrency?.trim() && (
                        <span>
                          {formatReleaseDate(release.price, release.priceCurrency, currency)}
                        </span>
                      )}
                    {release.barcode && <span className="tabular-nums">#{release.barcode}</span>}
                  </div>
                )}
              </div>
            </SelectItem>
          ))}
          {releasesData?.releases.length === 0 && !releasesLoading && (
            <div className="py-4 px-3 text-sm text-muted-foreground text-center">
              No releases found
            </div>
          )}
        </SelectContent>
      </Select>
    </Field>
  );
}
