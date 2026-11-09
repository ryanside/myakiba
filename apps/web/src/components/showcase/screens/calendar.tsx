import { Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDate,
  isSameDay,
  isSameMonth,
  setDate,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import { DisclosureIcon, NextIcon, PreviousIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Category = "Prepainted" | "Music" | "Plushes";

type Release = {
  readonly day: number;
  readonly title: string;
  readonly image: string | null;
  readonly category: Category;
  readonly yen: number | null;
};

const RELEASES = [
  {
    day: 1,
    title: "Saya no Uta - Saya - 1/7 (Wing)",
    image: "/example-item7.webp",
    category: "Prepainted",
    yen: 23_800,
  },
  {
    day: 11,
    title: "Magical Mirai official album",
    image: null,
    category: "Music",
    yen: null,
  },
  {
    day: 14,
    title: "Vocaloid - Hatsune Miku - 1/7 - Shaohua (Myethos)",
    image: "/example-item4.webp",
    category: "Prepainted",
    yen: 29_800,
  },
  {
    day: 18,
    title: "Kasane Teto single",
    image: null,
    category: "Music",
    yen: null,
  },
  {
    day: 21,
    title: "Utau - Kasane Teto - Nendoroid Plus (#50) (Gift)",
    image: "/example-item3.webp",
    category: "Plushes",
    yen: 4400,
  },
  {
    day: 26,
    title: "Vocaloid - Hatsune Miku - B-style - 1/4 - V3 (FREEing)",
    image: "/example-item2.webp",
    category: "Prepainted",
    yen: 30_000,
  },
] as const satisfies readonly Release[];

const CATEGORY_COLORS = {
  Prepainted: "var(--category-prepainted)",
  Music: "var(--category-music)",
  Plushes: "var(--category-plushes)",
} as const satisfies Record<Category, string>;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const YEN = new Intl.NumberFormat("en-US", { style: "currency", currency: "JPY" });

export const images: readonly string[] = RELEASES.flatMap((release) =>
  release.image ? [release.image] : [],
);

export function Screen({ now }: { readonly now: Date }) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(now)),
    end: endOfWeek(endOfMonth(now)),
  });

  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-6">
      <div className="flex min-h-9 items-center gap-6">
        <h1 className="page-title">Calendar</h1>
        <Toolbar now={now} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6">
        <MonthGrid now={now} days={days} />
        <ReleaseList now={now} fade={days.length <= 28} />
      </div>
    </div>
  );
}

function Toolbar({ now }: { readonly now: Date }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="inline-flex items-center gap-1.5">
        <span className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
          <HugeiconsIcon icon={PreviousIcon} strokeWidth={2} className="size-4" />
        </span>
        <Select label={format(now, "MMMM")} className="w-28" />
        <Select label={format(now, "yyyy")} className="w-[77px]" />
        <span className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
          <HugeiconsIcon icon={NextIcon} strokeWidth={2} className="size-4" />
        </span>
      </div>
      <div className="ml-auto inline-flex h-8 items-center rounded-full bg-muted p-[3px] text-muted-foreground">
        <Tab label="Items" active />
        <Tab label="Orders" />
      </div>
    </div>
  );
}

function Select({ label, className }: { readonly label: string; readonly className: string }) {
  return (
    <div className="relative">
      <div
        className={cn(
          "flex h-7 items-center rounded-[min(var(--radius-md),10px)] border border-input pl-2.5 text-sm dark:bg-input/30",
          className,
        )}
      >
        {label}
      </div>
      <HugeiconsIcon
        icon={DisclosureIcon}
        strokeWidth={2}
        className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function Tab({ label, active = false }: { readonly label: string; readonly active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-full items-center rounded-full border border-transparent px-3 py-0.5 text-sm font-medium",
        active && "bg-background text-foreground shadow-sm dark:bg-input",
      )}
    >
      {label}
    </span>
  );
}

function MonthGrid({ now, days }: { readonly now: Date; readonly days: readonly Date[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => (
          <DayCell
            key={date.toISOString()}
            date={date}
            inMonth={isSameMonth(date, now)}
            isToday={isSameDay(date, now)}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  date,
  inMonth,
  isToday,
}: {
  readonly date: Date;
  readonly inMonth: boolean;
  readonly isToday: boolean;
}) {
  const releases = inMonth ? RELEASES.filter((release) => release.day === getDate(date)) : [];

  return (
    <div
      className={cn(
        "flex min-h-28 flex-col gap-1 border-r border-b border-border/60 p-2.5 nth-[7n]:border-r-0",
        !inMonth && "bg-muted/50",
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "inline-flex h-5 items-center text-xs font-medium tabular-nums",
            isToday &&
              "min-w-5 justify-center rounded-full bg-primary px-1.5 text-primary-foreground",
            !isToday && inMonth && "text-foreground",
            !isToday && !inMonth && "text-muted-foreground/70",
          )}
        >
          {getDate(date)}
        </span>
        {releases.length > 0 ? (
          <span className="rounded-full bg-muted px-1.5 text-[0.6875rem] leading-4 font-medium tabular-nums">
            {releases.length}
          </span>
        ) : null}
      </span>
      {releases.length > 0 ? (
        <div className="mt-2 flex items-center overflow-hidden">
          {releases.map((release, index) => (
            <div
              key={release.title}
              className={cn(
                "relative size-9 shrink-0 overflow-hidden rounded-md border border-border shadow-sm",
                !release.image && "bg-muted",
                index > 0 && "-ml-5",
              )}
            >
              {release.image ? (
                <img
                  src={release.image}
                  alt={release.title}
                  className="h-full w-full object-cover object-top"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReleaseList({ now, fade }: { readonly now: Date; readonly fade: boolean }) {
  return (
    <div
      className={cn(
        "h-0 min-h-full overflow-hidden will-change-transform",
        fade && "mask-[linear-gradient(to_bottom,#000_calc(100%-min(12%,40px)),transparent)]",
      )}
    >
      <ol className="flex flex-col gap-5">
        {RELEASES.map((release) => (
          <li key={release.title} className="flex flex-col gap-1.5">
            <div className="flex pb-1">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {format(setDate(now, release.day), "EEE, MMM d")}
              </span>
            </div>
            <ReleaseRow release={release} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReleaseRow({ release }: { readonly release: Release }) {
  return (
    <div className="flex items-center gap-2.5 p-1.5">
      <div className="relative size-9 shrink-0 overflow-hidden rounded-md bg-muted after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--image-edge)">
        {release.image ? (
          <img
            src={release.image}
            alt={release.title}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <HugeiconsIcon icon={Image01Icon} className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium">{release.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="leading-4" style={{ color: CATEGORY_COLORS[release.category] }}>
            {release.category}
          </span>
          {release.yen ? <span className="tabular-nums">{YEN.format(release.yen)}</span> : null}
        </div>
      </div>
    </div>
  );
}
