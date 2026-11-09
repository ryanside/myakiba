import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Calendar01Icon,
  Delete01Icon,
  Edit03Icon,
  FolderAddIcon,
  MoveIcon,
  Refresh01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { format, getDaysInMonth, setHours, setMinutes } from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import { BackIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

const ITEM = {
  externalId: 236_103,
  title: "Vocaloid - Hatsune Miku - B-style - 1/4 - V3 (FREEing)",
  image: "/example-item2.webp",
  category: "Prepainted",
  version: "V3",
} as const;

type Release = { readonly date: Date; readonly yen: number; readonly barcode: string };

const LISTED_RELEASES: readonly Release[] = [
  { date: new Date(2024, 8, 12), yen: 27_000, barcode: "4570001512643" },
  { date: new Date(2021, 6, 19), yen: 27_000, barcode: "4571245299833" },
  { date: new Date(2015, 10, 19), yen: 25_741, barcode: "4571245295460" },
];

const ORDER_RELEASE_YEN = 30_000;

const ARTISTS = [
  { name: "Hiroshi (Sakurazensen)", role: "Sculptor" },
  { name: "iXima", role: "Illustrator" },
] as const;

const COLLECTION_ITEM = {
  status: "Ordered",
  details: [
    { label: "Count", value: "1" },
    { label: "Price", value: "$180.00" },
    { label: "Condition", value: "New" },
    { label: "Shop", value: "AmiAmi" },
    { label: "Shipping", value: "n/a" },
  ],
  order: "Miku V3 1/4 B-style",
} as const;

const CARD_ACTIONS: readonly {
  readonly label: string;
  readonly icon: IconSvgElement;
  readonly disabled: boolean;
}[] = [
  { label: "Edit", icon: Edit03Icon, disabled: false },
  { label: "Add to List", icon: FolderAddIcon, disabled: true },
  { label: "Move", icon: MoveIcon, disabled: false },
  { label: "Delete", icon: Delete01Icon, disabled: false },
];

const yen = new Intl.NumberFormat("en-US", { style: "currency", currency: "JPY" });
const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto", style: "narrow" });

/** A day in the month `offset` months from `now`. */
function dayOfMonth(now: Date, offset: number, day: number): Date {
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, getDaysInMonth(first)));
}

/** The JAN FREEing prints for a release in the date's month, as MFC lists it. */
function barcodeOn(date: Date): string {
  const seed = (ITEM.externalId * 7919 + date.getFullYear() * 31 + (date.getMonth() + 1)) % 100_000;
  const body = `4570001${String(seed).padStart(5, "0")}`;
  const sum = [...body].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return `${body}${(10 - (sum % 10)) % 10}`;
}

const day = (date: Date) => format(date, "MM/dd/yyyy");

const BADGE =
  "relative inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center gap-1 rounded-sm border border-transparent text-xs font-medium";
const SECONDARY_BADGE = cn(BADGE, "bg-secondary px-1.25 py-0.5 text-secondary-foreground");

function Hero({ updated, now }: { readonly updated: Date; readonly now: Date }) {
  const days = Math.round((updated.getTime() - now.getTime()) / 1000 / 60 / 60 / 24);
  const outline = cn(buttonVariants({ variant: "outline" }));
  return (
    <div className="flex flex-row gap-6">
      <div className="aspect-11/15 w-48 shrink-0 overflow-hidden rounded-xl bg-muted/30 ring-1 ring-foreground/6">
        <img src={ITEM.image} alt={ITEM.title} className="h-full w-full object-cover object-top" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-3">
        <div className="w-full space-y-1.5">
          <h1 className="text-2xl leading-tight font-medium tracking-tight">{ITEM.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-muted-foreground">
              myfigurecollection.net/item/{ITEM.externalId}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
              Updated <span className="inline-block min-w-16">{relative.format(days, "day")}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={outline}>
            <HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" />
            Refresh item details
          </span>
          <span className={outline}>
            <HugeiconsIcon icon={StarIcon} fill="none" data-icon="inline-start" />
            Add to Wishlist
          </span>
          <span className={outline}>
            <HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
            Add Item to List
          </span>
        </div>
      </div>
    </div>
  );
}

function Releases({ releases }: { readonly releases: readonly Release[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium text-muted-foreground">Releases</h2>
      <div className="w-full min-w-0 divide-y divide-border/50">
        {releases.map((release) => (
          <div
            key={release.barcode}
            className="flex flex-wrap items-center gap-3 py-2.5 text-sm first:pt-0"
          >
            <HugeiconsIcon
              icon={Calendar01Icon}
              className="size-3.5 shrink-0 text-muted-foreground/70"
            />
            <span className="font-medium tabular-nums">{day(release.date)}</span>
            <span
              className={cn(
                BADGE,
                "bg-secondary px-1.5 py-0.25 leading-none whitespace-normal text-secondary-foreground",
              )}
            >
              Standard (Japan)
            </span>
            <span className="text-xs text-muted-foreground/60 tabular-nums">{release.barcode}</span>
            <span className="ml-auto font-medium tabular-nums">{yen.format(release.yen)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children }: { readonly label: string; readonly children?: ReactNode }) {
  return (
    <div>
      <dt className="eyebrow leading-6">{label}</dt>
      {children ? <dd className="mt-1.5 flex flex-wrap gap-1.5">{children}</dd> : null}
    </div>
  );
}

function Related() {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium text-muted-foreground">Related</h2>
      <dl className="space-y-3">
        <Field label="Category">
          <span
            className={cn(BADGE, "px-1.25 py-0.5 whitespace-normal")}
            style={{
              backgroundColor: "transparent",
              borderColor: "var(--category-prepainted)",
              color: "var(--category-prepainted)",
            }}
          >
            {ITEM.category}
          </span>
        </Field>
        <Field label="Version">
          <span className={cn(SECONDARY_BADGE, "whitespace-normal")}>{ITEM.version}</span>
        </Field>
        <Field label="Artists">
          {ARTISTS.map(({ name, role }) => (
            <span key={name} className={cn(SECONDARY_BADGE, "whitespace-normal")}>
              {name}
              <span className="ml-1 text-muted-foreground">({role})</span>
            </span>
          ))}
        </Field>
        <Field label="Characters" />
      </dl>
    </section>
  );
}

function CollectionCard({ release, ordered }: { readonly release: Date; readonly ordered: Date }) {
  const steps = [
    { title: "Ordered", date: day(ordered) },
    { title: "Paid", date: "n/a" },
    { title: "Shipped", date: "n/a" },
    { title: "Collected", date: "n/a" },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              BADGE,
              "border-none bg-info/10 px-1.25 py-0.5 whitespace-nowrap text-info-foreground dark:bg-info/20",
            )}
          >
            {COLLECTION_ITEM.status}
          </span>
          <div className="text-xs text-muted-foreground/60 tabular-nums">
            <span>{day(release)}</span>
          </div>
        </div>
        <div className="-mr-2 flex items-center">
          {CARD_ACTIONS.map(({ label, icon, disabled }) => (
            <span
              key={label}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "text-muted-foreground",
                disabled && "opacity-40",
              )}
            >
              <HugeiconsIcon icon={icon} className="size-3.5" />
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {COLLECTION_ITEM.details.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <div className="tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex w-full">
        {steps.map(({ title, date }, index) => (
          <div key={title} className="relative mt-8 flex flex-1 flex-col gap-0.5 not-last:pe-8">
            <div
              className={cn(
                "absolute -top-6 left-0 size-4 -translate-y-1/2 rounded-full border-2",
                index === 0 ? "border-primary" : "border-primary/20",
              )}
            />
            {index === steps.length - 1 ? null : (
              <div className="absolute -top-6 h-0.5 w-[calc(100%-1rem-0.25rem)] translate-x-4.5 -translate-y-1/2 self-start bg-primary/10" />
            )}
            <div>
              <h3 className="text-sm font-medium">{title}</h3>
              <time className="mb-1 block text-xs font-medium text-muted-foreground">{date}</time>
            </div>
          </div>
        ))}
      </div>
      <span className="text-sm text-primary">View order: {COLLECTION_ITEM.order}</span>
    </div>
  );
}

export const images: readonly string[] = [ITEM.image];

/** The page the app shows at /item/236103, under the app frame. */
export function Screen({ now }: { readonly now: Date }) {
  const release = dayOfMonth(now, 0, 26);
  const ordered = dayOfMonth(now, -9, 14);
  const updated = setMinutes(setHours(dayOfMonth(now, -1, 5), 17), 45);
  const releases: readonly Release[] = [
    { date: release, yen: ORDER_RELEASE_YEN, barcode: barcodeOn(release) },
    ...LISTED_RELEASES,
  ];
  return (
    <div className="mx-auto flex max-w-352 flex-col gap-6">
      <span className="relative -mb-1 flex w-fit items-center gap-1.5 self-start rounded-md py-2.5 font-sans text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={BackIcon} className="size-3.5 shrink-0" />
        Back
      </span>
      <Hero updated={updated} now={now} />
      <div className="grid grid-cols-5">
        <div className="col-span-3 min-w-0 space-y-10 pt-8 pr-8 pb-8">
          <Releases releases={releases} />
          <Related />
        </div>
        <div className="col-span-2 pt-8 pb-8 pl-8">
          <h2 className="text-xs font-medium text-muted-foreground">Your Collection</h2>
          <div className="mt-4">
            <CollectionCard release={release} ordered={ordered} />
          </div>
        </div>
      </div>
    </div>
  );
}
