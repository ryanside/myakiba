import { GitMergeIcon, Store01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ShopTerm } from "@myakiba/contracts/vocabulary/schema";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";
import { Fragment, useId, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusButton } from "@/components/ui/status-button";
import { SuggestInput } from "@/components/ui/suggest-input";
import { useInvalidateRead, useRead, useResourceMutation } from "@/data/client";
import { renameShopsCommand, vocabulary } from "@/data/resources/vocabulary";
import { describeUses, rankTerms, shopVariantGroups, usesOf } from "@/lib/vocabulary-suggestions";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "./settings-group";
import { useSettingAnchor } from "./settings-row";
import { SETTINGS } from "./settings-registry";

/**
 * A shop name whose every space shows. A space at either end, in a run inside, or other than a plain
 * space keeps its width and gets a dot over it, so spellings that differ only in spacing look different.
 */
function ShopName({ shop }: { readonly shop: string }) {
  const parts = shop.split(/(\s+)/);
  return parts.map((part, index) => {
    const isSpace = index % 2 === 1;
    const separatesWords = part === " " && parts[index - 1] !== "" && parts[index + 1] !== "";
    if (!isSpace || separatesWords) return part;
    return [...part].map((space, offset) => (
      <span key={`${index}-${offset}`} className="relative whitespace-pre">
        {space}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 text-center text-muted-foreground select-none"
        >
          ·
        </span>
      </span>
    ));
  });
}

function QuotedShop({ shop }: { readonly shop: string }) {
  return (
    <>
      “<ShopName shop={shop} />”
    </>
  );
}

function separatorBefore(index: number, count: number): string {
  if (index === 0) return "";
  return index === count - 1 ? " and " : ", ";
}

function listed(shops: readonly string[]): ReactNode {
  return shops.map((shop, index) => (
    <Fragment key={shop}>
      {separatorBefore(index, shops.length)}
      <QuotedShop shop={shop} />
    </Fragment>
  ));
}

export function Shops() {
  const { data, isPending, isError } = useRead(vocabulary);
  const retry = useInvalidateRead(vocabulary);

  if (isPending) {
    return (
      <div aria-busy="true" aria-label="Loading your shops" className="flex flex-col">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex flex-col gap-1.5 py-3.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-pretty text-sm text-destructive" role="alert">
          Couldn&apos;t load your shops
        </p>
        <Button variant="outline" size="sm" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    );
  }

  if (data.shops.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Store01Icon} />
          </EmptyMedia>
          <EmptyTitle>No shops yet</EmptyTitle>
          <EmptyDescription>
            Shops you enter on Orders and Collection Items show here, ready to rename or merge.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const groups = shopVariantGroups(data.shops);

  return (
    <>
      {groups.length > 0 ? (
        <ShopsGroup setting="shop-merges">
          {groups.map((group) => (
            <MergeGroup key={group[0]?.value} spellings={group} />
          ))}
        </ShopsGroup>
      ) : null}
      <ShopsGroup setting="shop-list">
        {data.shops.map((shop) => (
          <ShopRow key={shop.value} shop={shop} shops={data.shops} />
        ))}
      </ShopsGroup>
    </>
  );
}

function ShopsGroup({
  setting,
  children,
}: {
  readonly setting: "shop-merges" | "shop-list";
  readonly children: ReactNode;
}) {
  const { className: anchorClassName, ...anchor } = useSettingAnchor<HTMLDivElement>(setting);
  const { title, description } = SETTINGS[setting];

  return (
    <SettingsGroup title={title} variant="cards">
      <div {...anchor} className={cn("-mx-4 flex flex-col", anchorClassName)}>
        <p className="px-4 pb-1 text-pretty text-[13px] leading-snug text-muted-foreground">
          {description}
        </p>
        <div className="divide-y divide-border/70">{children}</div>
      </div>
    </SettingsGroup>
  );
}

function MergeGroup({ spellings }: { readonly spellings: readonly ShopTerm[] }) {
  const rename = useResourceMutation(renameShopsCommand);
  const [chosen, setChosen] = useState<string>();
  const [mostUsed] = spellings;
  const keep = spellings.find((shop) => shop.value === chosen) ?? mostUsed;
  if (!keep || !mostUsed) return null;
  const merged = spellings.filter((shop) => shop !== keep);
  const from = merged.map((shop) => shop.value);
  const changes = usesOf(merged);
  const verb = changes.collectionItems + changes.orders === 1 ? "changes" : "change";

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <RadioGroup
        aria-label={`Spelling to keep for ${mostUsed.value}`}
        value={keep.value}
        onValueChange={(value) => setChosen(String(value))}
        className="gap-1.5"
      >
        {spellings.map((shop) => (
          <Label key={shop.value} className="flex min-w-0 items-center gap-2.5 font-normal">
            <RadioGroupItem value={shop.value} />
            <span className="min-w-0 text-sm font-medium whitespace-pre-wrap wrap-break-word">
              <ShopName shop={shop.value} />
            </span>
            <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
              {describeUses(usesOf([shop]))}
            </span>
          </Label>
        ))}
      </RadioGroup>
      <ConfirmDialog
        renderTrigger={
          <Button variant="outline" size="sm" className="self-start sm:self-auto">
            <HugeiconsIcon icon={GitMergeIcon} data-icon="inline-start" />
            Merge into <QuotedShop shop={keep.value} />
          </Button>
        }
        title={
          <>
            Merge into <QuotedShop shop={keep.value} />?
          </>
        }
        description={
          <>
            {describeUses(changes)} {verb} from {listed(from)} to <QuotedShop shop={keep.value} />.
          </>
        }
        confirmLabel="Merge"
        variant="default"
        icon={GitMergeIcon}
        onConfirm={() => rename.run({ from, to: keep.value })}
      />
    </div>
  );
}

function ShopRow({
  shop,
  shops,
}: {
  readonly shop: ShopTerm;
  readonly shops: readonly ShopTerm[];
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium whitespace-pre-wrap wrap-break-word">
          <ShopName shop={shop.value} />
        </span>
        <span className="text-[13px] leading-snug text-muted-foreground tabular-nums">
          {describeUses(usesOf([shop]))}
        </span>
      </div>
      <RenameShopDialog shop={shop} shops={shops} />
    </div>
  );
}

function RenameShopDialog({
  shop,
  shops,
}: {
  readonly shop: ShopTerm;
  readonly shops: readonly ShopTerm[];
}) {
  const rename = useResourceMutation(renameShopsCommand);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(shop.value);
  const others = shops.filter((other) => other.value !== shop.value);
  const to = draft.trim();
  const target = others.find((other) => other.value === to);
  const changes = describeUses(usesOf([shop]));
  const canSave = to.length > 0 && to !== shop.value && !rename.isPending;
  const inputId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (rename.isPending) return;
        setOpen(next);
        if (next) setDraft(shop.value);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" aria-label={`Rename ${shop.value}`}>
            Rename
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Rename <QuotedShop shop={shop.value} />
          </DialogTitle>
          <DialogDescription>
            The new name replaces it on {changes}, saved exactly as you type it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSave) return;
            const saved = await rename.run({ from: [shop.value], to });
            if (saved.isErr()) return;
            setOpen(false);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>New name</Label>
            <SuggestInput
              id={inputId}
              value={draft}
              onValueChange={setDraft}
              suggestions={rankTerms(others, draft)}
              maxLength={WRITE_LIMITS.shop}
              autoComplete="off"
            />
            <p
              className="text-pretty text-[13px] leading-snug text-muted-foreground empty:hidden"
              role="status"
            >
              {target ? (
                <>
                  <QuotedShop shop={target.value} /> is already one of your shops, so saving merges{" "}
                  <QuotedShop shop={shop.value} /> into it.
                </>
              ) : null}
            </p>
          </div>
          <DialogFooter>
            <StatusButton
              type="submit"
              status={rename.isPending ? "loading" : "idle"}
              disabled={!canSave}
            >
              {target ? "Merge" : "Rename"}
            </StatusButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
