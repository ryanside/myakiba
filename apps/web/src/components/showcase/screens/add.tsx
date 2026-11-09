import {
  Cancel01Icon,
  LibraryIcon,
  PackageIcon,
  PaintBucketIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { DisclosureIcon, ExpandIcon, ExternalIcon, UnsortedIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Condition = "New" | "Pre-Owned";

type PickedItem = {
  readonly title: string;
  readonly mfcId: number;
  readonly image: string | null;
  /** The release price in USD, or null when the release is priced in another currency. */
  readonly price: number | null;
  readonly count: number;
  readonly condition: Condition;
};

const PICKED = [
  {
    title: "Makise Kurisu - 1/7 (Good Smile Company)",
    mfcId: 1_618_468,
    image: "/example-item5.webp",
    price: 239.99,
    count: 1,
    condition: "New",
  },
  {
    title: "Frieren - Nendoroid (Good Smile Company)",
    mfcId: 1_597_342,
    image: null,
    price: 52.99,
    count: 1,
    condition: "New",
  },
  {
    title: "Hatsune Miku - 1/7 - Shaohua Ver. (Myethos)",
    mfcId: 998_271,
    image: "/example-item4.webp",
    price: 205,
    count: 1,
    condition: "New",
  },
  {
    title: "Kasane Teto - Nendoroid Plus (Gift)",
    mfcId: 235_327,
    image: "/example-item3.webp",
    price: null,
    count: 2,
    condition: "New",
  },
  {
    title: "Yor Forger - 1/7 - Thorn Princess (Aniplex)",
    mfcId: 1_588_413,
    image: null,
    price: 259,
    count: 1,
    condition: "New",
  },
  {
    title: "Ultimate Madoka - 1/8 (Good Smile Company)",
    mfcId: 98_665,
    image: "/example-item6.webp",
    price: 174.5,
    count: 1,
    condition: "Pre-Owned",
  },
  {
    title: "Power - 1/7 (Phat Company)",
    mfcId: 1_609_875,
    image: null,
    price: null,
    count: 1,
    condition: "New",
  },
  {
    title: "Saya - 1/7 (Wing)",
    mfcId: 287_732,
    image: "/example-item7.webp",
    price: null,
    count: 1,
    condition: "Pre-Owned",
  },
  {
    title: "Hatsune Miku - B-style - 1/4 - V3 (FREEing)",
    mfcId: 236_103,
    image: "/example-item2.webp",
    price: null,
    count: 1,
    condition: "New",
  },
  {
    title: "Marin Kitagawa - 1/7 (Aniplex)",
    mfcId: 1_604_118,
    image: null,
    price: 229,
    count: 1,
    condition: "New",
  },
  {
    title: "Rem - 1/7 - Crystal Dress Ver. (eStream)",
    mfcId: 1_575_960,
    image: null,
    price: null,
    count: 1,
    condition: "New",
  },
  {
    title: "Hoshino - 1/7 (Max Factory)",
    mfcId: 1_614_556,
    image: null,
    price: 189.99,
    count: 1,
    condition: "New",
  },
  {
    title: "Gotou Hitori - 1/7 (Kotobukiya)",
    mfcId: 1_621_030,
    image: null,
    price: null,
    count: 1,
    condition: "New",
  },
] as const satisfies readonly PickedItem[];

/** Pictures the screen shows. */
export const images: readonly string[] = PICKED.flatMap((item) => (item.image ? [item.image] : []));

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const COLUMNS = [
  { title: null, width: 32 },
  { title: "Item", width: 416 },
  { title: "Price", width: 144 },
  { title: "Count", width: 80 },
  { title: "Condition", width: 144 },
  { title: null, width: 136 },
] as const;

const HEADER_CELL =
  "relative h-8 border-b border-border/70 px-2 text-left align-middle font-normal text-secondary-foreground/80";
const BODY_CELL = "px-2 py-1.5 align-middle";
const INLINE_CELL =
  "-mx-2 flex h-8 w-[calc(100%+1rem)] min-w-0 items-center truncate rounded-lg border border-transparent px-2 py-1 text-sm font-medium text-foreground tabular-nums";

function Checked(): ReactNode {
  return (
    <span className="relative mb-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs border border-primary bg-primary align-[inherit] text-primary-foreground dark:bg-primary">
      <span className="grid place-content-center text-current [&>svg]:size-3.5">
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
      </span>
    </span>
  );
}

function SortHeader({ title }: { readonly title: string }): ReactNode {
  return (
    <div className="flex h-full items-center">
      <span
        className={cn(
          buttonVariants({ variant: "ghost", size: "xs" }),
          "-ms-2 gap-1.5 rounded-lg px-2 text-sm font-normal text-secondary-foreground/80 has-data-[icon=inline-end]:pr-2",
        )}
      >
        {title}
        <span data-icon="inline-end" className="mt-px inline-flex">
          <HugeiconsIcon icon={UnsortedIcon} strokeWidth={2} className="size-3.25" />
        </span>
      </span>
    </div>
  );
}

function Thumbnail({ item }: { readonly item: PickedItem }): ReactNode {
  if (item.image === null) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <HugeiconsIcon icon={PackageIcon} className="size-4" />
      </div>
    );
  }
  return (
    <div className="size-8 shrink-0 overflow-hidden rounded-md">
      <img src={item.image} alt="" className="h-full w-full object-cover object-top" />
    </div>
  );
}

function Row({ item }: { readonly item: PickedItem }): ReactNode {
  return (
    <tr className="bg-muted/50">
      <td className={cn(BODY_CELL, "relative")}>
        <div className="absolute start-0 top-0 bottom-0 w-[2px] bg-primary" />
        <Checked />
      </td>
      <td className={cn(BODY_CELL, "truncate")}>
        <div className="flex items-center gap-3 pe-4">
          <Thumbnail item={item} />
          <div className="min-w-0 flex-1 space-y-px">
            <span className="block w-fit max-w-full truncate font-medium text-foreground">
              {item.title}
            </span>
            <div className="flex items-center gap-2 font-normal">
              <span className="text-xs text-muted-foreground tabular-nums">MFC #{item.mfcId}</span>
            </div>
          </div>
        </div>
      </td>
      <td className={cn(BODY_CELL, "truncate")}>
        <span className={cn(INLINE_CELL, item.price === null && "text-muted-foreground")}>
          {item.price === null ? "No price" : usd.format(item.price)}
        </span>
      </td>
      <td className={cn(BODY_CELL, "truncate")}>
        <span className={INLINE_CELL}>{item.count}</span>
      </td>
      <td className={cn(BODY_CELL, "truncate")}>
        <span className="-mx-2 flex h-8 w-[calc(100%+1rem)] items-center rounded-lg border border-transparent px-2 py-2 text-sm">
          {item.condition}
        </span>
      </td>
      <td className={BODY_CELL} aria-label="Row actions">
        <div className="flex items-center justify-end gap-0.5">
          <span className={cn(buttonVariants({ variant: "ghost" }))}>
            <HugeiconsIcon
              icon={ExpandIcon}
              data-icon="inline-start"
              className="text-muted-foreground"
            />
            Details
          </span>
          <span
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground",
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </span>
        </div>
      </td>
    </tr>
  );
}

function Destination({ count }: { readonly count: number }): ReactNode {
  return (
    <section className="flex items-center gap-2 text-sm">
      <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
        <span className="block">{`Add ${count} items to`}</span>
      </span>
      <div className="shrink-0">
        <span className="flex h-8 w-full items-center justify-between gap-1.5 rounded-full border border-input bg-transparent py-2 pr-2.5 pl-2.5 text-sm whitespace-nowrap dark:bg-input/30">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <HugeiconsIcon icon={LibraryIcon} className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex flex-1 text-left">Collection</span>
          </span>
          <HugeiconsIcon
            icon={DisclosureIcon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
        </span>
      </div>
      <span className="ms-2 shrink-0 text-muted-foreground">also on</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input dark:bg-input/30" />
        <span className="flex items-center gap-2 text-sm leading-none font-normal">Wishlist</span>
      </span>
      <span className="shrink-0 text-muted-foreground">and</span>
      <span className="flex min-w-0">
        <span
          className={cn(
            buttonVariants({ variant: "outline" }),
            "max-w-56 min-w-0 shrink justify-between pr-2",
          )}
        >
          <span className="min-w-0 truncate">Lists</span>
          <HugeiconsIcon
            icon={DisclosureIcon}
            strokeWidth={2}
            className="shrink-0 text-muted-foreground"
          />
        </span>
      </span>
      <div className="ms-auto flex">
        <span className={cn(buttonVariants(), "w-full min-w-0")}>
          <span className="grid max-w-[26rem]">
            <span className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-normal [overflow-wrap:anywhere]">
              {`Add ${count} to collection`}
            </span>
            <span className="col-start-1 row-start-1 w-0 min-w-full truncate">
              {`Add ${count} to collection`}
            </span>
          </span>
        </span>
      </div>
    </section>
  );
}

function SearchRow(): ReactNode {
  return (
    <div className="flex items-center justify-between gap-1 border-t border-border/70 py-1 ps-8.5 pe-2">
      <span className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" strokeWidth={2} />
        <span>
          <span>Search </span>MyFigureCollection
        </span>
        <HugeiconsIcon
          icon={ExternalIcon}
          data-icon="inline-end"
          strokeWidth={2}
          className="text-muted-foreground"
        />
      </span>
      <span
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "font-normal text-muted-foreground",
        )}
      >
        <span>Search </span>myakiba
      </span>
    </div>
  );
}

/** The page the app shows at /add once the extension's picks are in, all bound for the collection. */
export function Screen({ now: _now }: { readonly now: Date }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex min-h-9 flex-wrap items-center">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="min-w-0 page-title break-words">Add items</h1>
          <p className="min-h-6 text-[1.0625rem] leading-6 text-muted-foreground tabular-nums">
            {`${PICKED.length} Items`}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <Destination count={PICKED.length} />
        <div>
          <table className="w-full table-fixed border-separate border-spacing-0 text-left align-middle text-sm font-normal text-foreground">
            <thead>
              <tr>
                {COLUMNS.map((column, index) => (
                  <th key={index} className={HEADER_CELL} style={{ width: column.width }}>
                    {index === 0 ? <Checked /> : null}
                    {column.title === null ? null : <SortHeader title={column.title} />}
                    {index === COLUMNS.length - 1 ? (
                      <div className="flex justify-end">
                        <span className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}>
                          <HugeiconsIcon icon={PaintBucketIcon} data-icon="inline-start" />
                          Fill all
                        </span>
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PICKED.map((item) => (
                <Row key={item.mfcId} item={item} />
              ))}
            </tbody>
          </table>
          <SearchRow />
        </div>
      </div>
    </div>
  );
}
