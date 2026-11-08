import { PackageSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import type { ReactNode } from "react";
import { AddLink } from "@/components/add/add-link";
import { STATE_ICON_CLASS_NAME, STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { BackLink } from "@/components/ui/back-link";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

export function ItemNotFound({ externalId }: { readonly externalId: number }): ReactNode {
  return (
    <div className="flex flex-col gap-6 mx-auto max-w-352">
      <BackLink fallbackTo="/collection" text="Back" font="sans" className="self-start" />
      <Empty className={STATE_PANEL_CLASS_NAME}>
        <EmptyHeader>
          <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
            <HugeiconsIcon icon={PackageSearchIcon} className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Item not in the Item Database yet</EmptyTitle>
          <EmptyDescription>
            MyFigureCollection item #{externalId} isn&apos;t in myakiba yet. Pick it on
            MyFigureCollection to add it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="sm:max-w-2xl">
          <AddLink search={{ mfc: externalId }}>Add this item</AddLink>
          <a
            href={mfcItemUrl(externalId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:underline"
          >
            View myfigurecollection.net/item/{externalId}
          </a>
        </EmptyContent>
      </Empty>
    </div>
  );
}
