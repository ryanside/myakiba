import { Loading03Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import type { Currency, DateFormat } from "@myakiba/contracts/shared/types";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import { parseDateOnly } from "@myakiba/utils/date-only";
import { addDays } from "date-fns";
import { useState } from "react";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreferencesSave } from "@/data/resources/settings";
import type { Formats } from "@/data/resources/settings";
import { useToday } from "@/hooks/use-today";
import type { User } from "@/lib/auth-client";
import { formatDateOnlyForDisplay } from "@/lib/date-display";
import { getCurrencyLocale } from "@/lib/locale";
import { SettingsGroup, SettingsGroupFooter } from "./settings-group";
import { SettingsRow } from "./settings-row";

export function Preferences({ user }: { user: User }) {
  const session: Formats = {
    // Better Auth types additional fields as strings, and the server only stores these enums.
    currency: user.currency as Currency,
    dateFormat: user.dateFormat as DateFormat,
  };
  const { save, saving } = usePreferencesSave();
  const [saved, setSaved] = useState(session);
  const [edits, setEdits] = useState<Partial<Formats>>({});
  const [seenSession, setSeenSession] = useState(session);
  const draft = { ...saved, ...edits };
  const changes = changesFrom(saved, draft);
  const dirty = Object.keys(changes).length > 0;

  // The session catches up with this form's own save a render late, so only a change to the
  // session itself, like a save from another tab, moves the formats the user hasn't edited.
  if (!sameFormats(session, seenSession)) {
    setSeenSession(session);
    setSaved(session);
  }

  const edit = (next: Partial<Formats>) => setEdits((current) => ({ ...current, ...next }));

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (saving || !dirty) return;
        if (await save(changes)) {
          setSaved((current) => ({ ...current, ...changes }));
          setEdits({});
        }
      }}
    >
      <SettingsGroup title="Formats">
        <SettingsRow setting="currency" htmlFor="currency">
          <CurrencySelect
            id="currency"
            value={draft.currency}
            onValueChange={(currency) => edit({ currency })}
            disabled={saving}
          />
        </SettingsRow>

        <SettingsRow setting="date-format">
          <ToggleGroup
            aria-label="Date format"
            variant="outline"
            spacing={1}
            value={[draft.dateFormat]}
            onValueChange={(next) => {
              const dateFormat = DATE_FORMATS.find((format) => format === next[0]);
              if (dateFormat) edit({ dateFormat });
            }}
            disabled={saving}
            className="w-full flex-wrap justify-start sm:w-auto sm:justify-end"
          >
            {DATE_FORMATS.map((format) => (
              <ToggleGroupItem key={format} value={format} className="tabular-nums">
                {format}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsRow>

        <FormatPreview currency={draft.currency} dateFormat={draft.dateFormat} />

        <SettingsGroupFooter>
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? (
              <>
                <HugeiconsIcon
                  icon={Loading03Icon}
                  data-icon="inline-start"
                  className="animate-spin motion-reduce:animate-none"
                />
                Saving…
              </>
            ) : (
              "Save preferences"
            )}
          </Button>
        </SettingsGroupFooter>
      </SettingsGroup>
    </form>
  );
}

function sameFormats(a: Formats, b: Formats): boolean {
  return a.currency === b.currency && a.dateFormat === b.dateFormat;
}

/** The formats in `draft` that differ from `saved`, which is all a save sends. */
function changesFrom(saved: Formats, draft: Formats): Partial<Formats> {
  return {
    ...(draft.currency !== saved.currency && { currency: draft.currency }),
    ...(draft.dateFormat !== saved.dateFormat && { dateFormat: draft.dateFormat }),
  };
}

const PREVIEW_TOTAL_MINOR_UNITS = 18_450;
const PREVIEW_DATES = [
  { label: "Release", daysFromToday: 52 },
  { label: "Ordered", daysFromToday: -36 },
  { label: "Paid", daysFromToday: -9 },
] as const;

/** An example order, as it reads with the formats not yet saved. */
function FormatPreview({ currency, dateFormat }: Formats) {
  const today = parseDateOnly(useToday()) ?? new Date();

  return (
    <div className="flex flex-col gap-3 bg-muted/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium">Preview</p>
        <p className="text-pretty text-[13px] leading-snug text-muted-foreground">
          An order on your dashboard, with your formats.
        </p>
      </div>
      <figure
        aria-label="Example order"
        className="flex w-full shrink-0 flex-col gap-2.5 rounded-xl bg-background p-3 shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_oklch(0_0_0/0.06)] sm:w-72 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border">
            <HugeiconsIcon
              icon={PackageIcon}
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm leading-tight font-medium">Example preorder</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              2 items
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {formatCurrencyFromMinorUnits(
                  PREVIEW_TOTAL_MINOR_UNITS,
                  currency,
                  getCurrencyLocale(currency),
                )}
              </span>
            </span>
          </div>
        </div>
        <dl className="flex flex-col gap-1">
          {PREVIEW_DATES.map(({ label, daysFromToday }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
              <dd className="text-xs tabular-nums">
                {formatDateOnlyForDisplay(addDays(today, daysFromToday), dateFormat)}
              </dd>
            </div>
          ))}
        </dl>
      </figure>
    </div>
  );
}
