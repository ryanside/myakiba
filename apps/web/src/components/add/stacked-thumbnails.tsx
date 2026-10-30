import { Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";

const MAX_SHOWN = 5;

export type ThumbnailItem = {
  readonly itemId: string;
  readonly title: string;
  readonly image: string | null;
};

const TILE =
  "size-10 shrink-0 rounded-lg ring-2 ring-popover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10";

/** Overlapping pictures of the Items a toast talks about, so it shows what was added. */
export function StackedThumbnails({ items }: { readonly items: readonly ThumbnailItem[] }) {
  const shown = items.slice(0, MAX_SHOWN);
  const hidden = items.length - shown.length;
  return (
    <div className="flex shrink-0 -space-x-5 rtl:space-x-reverse">
      {shown.map(({ itemId, title, image }) => (
        <div key={itemId} className="relative">
          <ImageThumbnail
            images={image ? [image] : []}
            title={title}
            className={TILE}
            fallbackIcon={
              <>
                <HugeiconsIcon
                  icon={Image01Icon}
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="sr-only">{title}</span>
              </>
            }
          />
        </div>
      ))}
      {hidden > 0 ? (
        <div
          className={`relative flex items-center justify-center bg-muted text-xs font-medium tabular-nums ${TILE}`}
        >
          <span aria-hidden="true">+{hidden}</span>
          <span className="sr-only">and {hidden} more</span>
        </div>
      ) : null}
    </div>
  );
}
